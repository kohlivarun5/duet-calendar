#!/usr/bin/env node
// Run after `npm run build`: exercise the actual Wrangler bundle in workerd.
// Test keys exist only in this process; no Apple trust roots or production
// configuration are changed, and all outbound HTTP is blocked.
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Runtime smoke requires Node 24 or later');
const bundle = fileURLToPath(new URL('../dist/index.js', import.meta.url));
await access(bundle);
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const originalTransactionId = '2000000000000001';
const hashSecret = randomBytes(32).toString('hex');
const now = Date.now();
const campaign = {
  id: 'runtime-smoke-only', enabled: true,
  offerIdentifier: 'runtime-smoke-monthly',
  targetProductId: 'com.vkohli.zoeycalendar.shared.monthly',
  sourceProductIds: ['com.vkohli.zoeycalendar.shared.monthly'],
  messageIdentifiers: { 'en-US': 'runtime-smoke-message' },
  startsAt: new Date(now - 60_000).toISOString(),
  endsAt: new Date(now + 5 * 60_000).toISOString(),
  storefronts: ['USA'],
};
let outboundRequests = 0;
const mf = new Miniflare(convertV4MiniflareOptions({
  name: 'duet-retention-runtime-smoke',
  scriptPath: bundle,
  modules: true,
  compatibilityDate: '2026-10-27',
  compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 0, cf: false, logRequests: false,
  telemetry: { enabled: false },
  durableObjects: { RETENTION_LEDGER: { className: 'RetentionLedger', useSQLite: true } },
  bindings: {
    ENVIRONMENT: 'Sandbox', RETENTION_CAMPAIGN_JSON: JSON.stringify(campaign),
    IAP_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    IAP_KEY_ID: 'SMOKETEST1', IAP_ISSUER_ID: '00000000-0000-4000-8000-000000000001',
    SUBSCRIBER_HASH_SECRET: hashSecret,
  },
  outboundService: async () => {
    outboundRequests += 1;
    throw new Error('Runtime smoke forbids outbound HTTP');
  },
}));

try {
  await mf.ready;
  const health = await mf.dispatchFetch('https://runtime.invalid/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    service: 'duet-retention-api', environment: 'Sandbox', offersEnabled: true,
  });

  // These invoke the real bundled Apple SDK verifier, without a test CA or a
  // verification dependency override. Malformed Apple input must fail closed.
  for (const [path, body, error] of [
    ['/v1/apple/retention', { signedPayload: 'not-a-jws' }, 'invalid_apple_request'],
    ['/v1/offers/retention', { signedTransactionInfo: 'not-a-jws', signedRenewalInfo: 'not-a-jws' }, 'invalid_subscription_proof'],
    ['/v1/apple/subscription-notifications', { signedPayload: 'not-a-jws' }, 'invalid_apple_notification'],
  ]) {
    const result = await mf.dispatchFetch(`https://runtime.invalid${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(result.status, 401, `Malformed Apple JWS must fail closed at ${path}`);
    assert.deepEqual(await result.json(), { error });
  }

  // This private binding is available only to the local test harness. It uses
  // the actual DurableObject subclass exported by the production entrypoint,
  // and the real Apple SDK ES256 signer executing inside workerd.
  const namespace = await mf.getDurableObjectNamespace('RETENTION_LEDGER');
  const hashedSubscriberId = createHmac('sha256', hashSecret)
    .update(`Sandbox:${originalTransactionId}`).digest('hex');
  assert.match(hashedSubscriberId, /^[a-f0-9]{64}$/);
  assert.notEqual(hashedSubscriberId, originalTransactionId);
  const actorId = namespace.idFromName(hashedSubscriberId);
  const requestBody = JSON.stringify({ originalTransactionId, campaignId: campaign.id });
  const ledgerFetch = action => namespace.get(actorId).fetch(`https://ledger.internal/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody,
  });
  const offer = await ledgerFetch('offer');
  assert.equal(offer.status, 200, 'The real Durable Object must issue an offer');
  const { signature } = await offer.json();
  assert.equal(typeof signature, 'string');
  const parts = signature.split('.');
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, 'SMOKETEST1');
  assert.ok(verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
    key: publicKey, dsaEncoding: 'ieee-p1363',
  }, Buffer.from(parts[2], 'base64url')), 'Verify workerd-generated ES256 using the ephemeral public key');
  assert.equal(claims.aud, 'promotional-offer');
  assert.equal(claims.iss, '00000000-0000-4000-8000-000000000001');
  assert.equal(claims.bid, 'com.vkohli.ZoeyCalendar');
  assert.equal(claims.productId, campaign.targetProductId);
  assert.equal(claims.offerIdentifier, campaign.offerIdentifier);
  assert.equal(claims.transactionId, originalTransactionId);
  assert.ok(Number.isSafeInteger(claims.iat) && Math.abs(claims.iat - Date.now() / 1000) < 60);
  assert.match(claims.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(Object.hasOwn(claims, 'exp'), false, 'Apple retention signatures must omit exp');

  const cached = await ledgerFetch('offer');
  assert.equal(cached.status, 200);
  assert.ok((await cached.json()).signature === signature, 'The actor should reuse its short-lived signature');
  const redemption = await ledgerFetch('redeemed');
  assert.equal(redemption.status, 200);
  assert.deepEqual(await redemption.json(), { recorded: true });
  const repeat = await ledgerFetch('offer');
  assert.equal(repeat.status, 409);
  assert.deepEqual(await repeat.json(), { error: 'already_redeemed' });
  assert.equal(outboundRequests, 0, 'The runtime smoke must make no outbound Apple requests');
  console.log('PASS: workerd health, real SDK rejects malformed Apple JWS, Durable Object ES256/no-exp/lineage binding, redemption blocks reuse; no outbound HTTP');
} finally {
  await mf.dispose();
}
