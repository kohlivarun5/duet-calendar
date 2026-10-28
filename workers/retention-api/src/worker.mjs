import { parseConfig, validateRealtimeRequest, evaluateNativeEligibility, appAppleIdMatches, PolicyError } from './policy.mjs';
import * as apple from './apple.mjs';

const MAX_BODY_BYTES = 32_768;
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const response = (body, status = 200) => Response.json(body, { status, headers: HEADERS });

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new PolicyError('json_required', 415);
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new PolicyError('body_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PolicyError('invalid_body');
  let length = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new PolicyError('body_too_large', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    throw new PolicyError('invalid_body');
  }
}

function requireFields(body, fields) {
  if (Object.keys(body).some(key => !fields.includes(key))
      || fields.some(key => typeof body[key] !== 'string' || !body[key] || body[key].length > 16_384)) {
    throw new PolicyError('invalid_body');
  }
}

async function deadline(promise, milliseconds = 500) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('deadline_exceeded')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function activeCampaign(config, now) {
  return config.campaign.enabled && config.campaign.startsAt <= now && now < config.campaign.endsAt;
}

function requireSignature(offer) {
  if (typeof offer?.signature !== 'string' || offer.signature.length > 16_384
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(offer.signature)) {
    throw new Error('invalid_offer_signature');
  }
  return offer;
}

async function ledgerRequest(action, originalTransactionId, config, env) {
  if (!env.RETENTION_LEDGER) throw new Error('ledger_unconfigured');
  const key = await apple.subscriberKey(originalTransactionId, config, env);
  const id = env.RETENTION_LEDGER.idFromName(key);
  const result = await env.RETENTION_LEDGER.get(id).fetch(`https://ledger.internal/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalTransactionId, campaignId: config.campaign.id }),
  });
  if (!result.ok) throw new PolicyError('offer_unavailable', result.status);
  return result.json();
}

export function createHandler(dependencies = {}) {
  const deps = { verifyRealtime: apple.verifyRealtime, verifyNative: apple.verifyNative,
    fetchSubscriptionStatus: apple.fetchSubscriptionStatus,
    verifyNotification: apple.verifyNotification, ledgerRequest, ...dependencies };
  return async (request, env) => {
    let config;
    try { config = parseConfig(env); } catch { return response({ error: 'service_unconfigured' }, 503); }
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') {
      return response({ service: 'duet-retention-api', environment: config.environment,
        offersEnabled: activeCampaign(config, Date.now()) });
    }
    if (!['/v1/apple/retention', '/v1/offers/retention', '/v1/apple/subscription-notifications'].includes(path)) {
      return response({ error: 'not_found' }, 404);
    }
    if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
    try {
      const body = await readBody(request);
      if (path === '/v1/apple/retention') {
        requireFields(body, ['signedPayload']);
        // Invalid or forged Apple input must never select even a fallback message.
        let decoded;
        try { decoded = await deadline(deps.verifyRealtime(body.signedPayload, config), 150); }
        catch { return response({ error: 'invalid_apple_request' }, 401); }
        const context = validateRealtimeRequest(decoded, config);
        const messageIdentifier = config.campaign.messageIdentifiers[context.userLocale];
        if (!activeCampaign(config, Date.now()) || !messageIdentifier) {
          // A non-200 response invokes Apple's separately configured fallback.
          return response({ error: 'offer_unavailable' }, 503);
        }
        try {
          const offer = requireSignature(await deadline((async () => {
            const current = await deps.fetchSubscriptionStatus(context.originalTransactionId, config, env);
            const eligibility = evaluateNativeEligibility(current.transaction, current.renewal, config,
              Date.now(), { cancellationFlow: true });
            if (!eligibility.eligible || eligibility.originalTransactionId !== context.originalTransactionId
                || eligibility.sourceProductId !== context.sourceProductId) throw new Error('not_eligible');
            return deps.ledgerRequest('offer', context.originalTransactionId, config, env);
          })(), 450));
          return response({ promotionalOffer: { messageIdentifier, promotionalOfferSignatureV2: offer.signature } });
        } catch {
          return response({ message: { messageIdentifier } });
        }
      }
      if (path === '/v1/offers/retention') {
        requireFields(body, ['signedTransactionInfo', 'signedRenewalInfo']);
        let proofs;
        try { proofs = await deadline(deps.verifyNative(body, config), 1500); }
        catch { return response({ error: 'invalid_subscription_proof' }, 401); }
        const { transaction, renewal } = proofs;
        // Old transaction signatures are legitimate ownership proofs, but never
        // authoritative current state. Query Apple after verifying their binding.
        if (transaction.bundleId !== config.bundleId || transaction.environment !== config.environment
            || transaction.inAppOwnershipType !== 'PURCHASED'
            || transaction.type !== 'Auto-Renewable Subscription'
            || renewal.environment !== config.environment
            || !/^\d{1,64}$/.test(transaction.originalTransactionId ?? '')
            || renewal.originalTransactionId !== transaction.originalTransactionId
            || renewal.productId !== transaction.productId
            || !config.campaign.sourceProductIds.includes(transaction.productId)) {
          throw new PolicyError('invalid_subscription_binding', 401);
        }
        if (!activeCampaign(config, Date.now())) return response({ eligible: false, reason: 'campaign_unavailable' }, 409);
        const current = await deadline(deps.fetchSubscriptionStatus(transaction.originalTransactionId, config, env), 1500);
        const eligibility = evaluateNativeEligibility(current.transaction, current.renewal, config);
        if (eligibility.originalTransactionId !== transaction.originalTransactionId
            || eligibility.sourceProductId !== transaction.productId) {
          throw new PolicyError('subscription_changed', 409);
        }
        if (!eligibility.eligible) return response({ eligible: false, reason: eligibility.reason }, 409);
        if (!activeCampaign(config, Date.now())) return response({ eligible: false, reason: 'campaign_unavailable' }, 409);
        const offer = requireSignature(await deps.ledgerRequest('offer', eligibility.originalTransactionId, config, env));
        return response({ eligible: true, campaignId: config.campaign.id,
          productId: config.campaign.targetProductId, offerIdentifier: config.campaign.offerIdentifier,
          promotionalOfferSignatureV2: offer.signature });
      }
      requireFields(body, ['signedPayload']);
      let result;
      try { result = await deadline(deps.verifyNotification(body.signedPayload, config), 1500); }
      catch { return response({ error: 'invalid_apple_notification' }, 401); }
      const { notification, transaction, renewal } = result;
      const data = notification.data;
      // Apple documents data.appAppleId as absent in Sandbox notifications.
      // https://developer.apple.com/documentation/appstoreservernotifications/data
      if (!data || !appAppleIdMatches(data.appAppleId, config, { allowSandboxOmission: true })
          || data.bundleId !== config.bundleId
          || data.environment !== config.environment) throw new PolicyError('invalid_notification_binding', 401);
      if (transaction && (transaction.bundleId !== config.bundleId || transaction.environment !== config.environment
          || typeof transaction.originalTransactionId !== 'string'
          || !/^\d{1,64}$/.test(transaction.originalTransactionId))) {
        throw new PolicyError('invalid_notification_binding', 401);
      }
      if (renewal && (!transaction || renewal.environment !== config.environment
          || renewal.originalTransactionId !== transaction.originalTransactionId
          || renewal.productId !== transaction.productId)) {
        throw new PolicyError('invalid_notification_binding', 401);
      }
      const redeemedNow = transaction?.offerIdentifier === config.campaign.offerIdentifier
        && transaction.offerType === 2 && transaction.productId === config.campaign.targetProductId;
      const scheduled = renewal?.offerIdentifier === config.campaign.offerIdentifier
        && renewal.offerType === 2 && renewal.autoRenewProductId === config.campaign.targetProductId;
      if (redeemedNow || scheduled) {
        await deps.ledgerRequest('redeemed', transaction.originalTransactionId, config, env);
      }
      return response({ received: true });
    } catch (error) {
      // Never log signed payloads, identifiers, request bodies, or SDK errors.
      if (error instanceof PolicyError) return response({ error: error.code }, error.status);
      return response({ error: 'temporarily_unavailable' }, 503);
    }
  };
}

export default { fetch: createHandler() };
