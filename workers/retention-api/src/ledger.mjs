import { parseConfig } from './policy.mjs';
import { signOffer } from './apple.mjs';

// One actor per HMAC(environment, originalTransactionId). The binding is private
// to the Worker; it has no public route. No raw subscription ID is stored.
export class RetentionLedger {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.cached = null; // Signed tokens are never persisted to durable storage.
  }

  async fetch(request) {
    if (request.method !== 'POST') return Response.json({ error: 'invalid_request' }, { status: 400 });
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'invalid_request' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    const config = parseConfig(this.env);
    if (request.method !== 'POST' || body.campaignId !== config.campaign.id) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    const path = new URL(request.url).pathname;
    if (path === '/redeemed') {
      await this.state.storage.put(`redeemed:${config.campaign.id}`, true);
      this.cached = null;
      return Response.json({ recorded: true });
    }
    if (path !== '/offer' || !config.campaign.enabled
        || Date.now() < config.campaign.startsAt || Date.now() >= config.campaign.endsAt
        || !/^\d{1,64}$/.test(body.originalTransactionId ?? '')) {
      return Response.json({ error: 'offer_unavailable' }, { status: 409 });
    }
    const now = Date.now();
    const result = await this.state.storage.transaction(async tx => {
      if (await tx.get(`redeemed:${config.campaign.id}`)) return { status: 409, reason: 'already_redeemed' };
      const window = Math.floor(now / 60_000);
      const rate = await tx.get('rate');
      const count = rate?.window === window ? rate.count + 1 : 1;
      if (count > 12) return { status: 429, reason: 'rate_limited' };
      await tx.put('rate', { window, count });
      return { status: 200 };
    });
    if (result.status !== 200) return Response.json({ error: result.reason }, { status: result.status });
    let candidate = this.cached;
    if (!candidate || candidate.createdAt + 60_000 <= now
        || candidate.campaignId !== config.campaign.id) {
      candidate = { campaignId: config.campaign.id, createdAt: now,
        signature: await signOffer(body.originalTransactionId, config, this.env) };
    }
    // Signing can yield while a notification records redemption. Never restore
    // the cache or return that in-flight signature after observing its marker.
    if (await this.state.storage.get(`redeemed:${config.campaign.id}`)) {
      this.cached = null;
      return Response.json({ error: 'already_redeemed' }, { status: 409 });
    }
    this.cached = candidate;
    return Response.json({ signature: candidate.signature });
  }
}
