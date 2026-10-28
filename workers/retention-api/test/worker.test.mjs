import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/worker.mjs';
import { DEFAULT_APP_ID, DEFAULT_BUNDLE_ID, MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID } from '../src/policy.mjs';

const ORIGINAL_ID = '2000000123456789';
const REQUEST_ID = '912ebd5e-6f60-4c5a-a3d4-1e0fdcdb9070';
const OFFER_ID = 'test-monthly-offer';
// This is a shape-only internal stub. Cryptographic signature claims are tested
// separately against the official Apple signer using ephemeral test keys.
const SIGNATURE = 'eyJhbGciOiJFUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.dGVzdC1zaWduYXR1cmU';

function fixture({ campaign = {}, realtime = {}, transaction = {}, renewal = {},
  overrides = {}, notification = {} } = {}) {
  const now = Date.now();
  const env = { ENVIRONMENT: 'Sandbox', RETENTION_CAMPAIGN_JSON: JSON.stringify({
    id: 'test-campaign', enabled: true, offerIdentifier: OFFER_ID, targetProductId: MONTHLY_PRODUCT_ID,
    sourceProductIds: [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID],
    messageIdentifiers: { 'en-US': 'test-message' }, storefronts: ['USA'],
    startsAt: new Date(now - 86_400_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(),
    ...campaign,
  }) };
  const context = {
    appAppleId: DEFAULT_APP_ID, environment: 'Sandbox', productId: YEARLY_PRODUCT_ID,
    originalTransactionId: ORIGINAL_ID, requestIdentifier: REQUEST_ID, userLocale: 'en-US', signedDate: now,
    ...realtime,
  };
  const proof = {
    transaction: {
      bundleId: DEFAULT_BUNDLE_ID, environment: 'Sandbox', productId: YEARLY_PRODUCT_ID,
      originalTransactionId: ORIGINAL_ID, type: 'Auto-Renewable Subscription', inAppOwnershipType: 'PURCHASED',
      expiresDate: now + 86_400_000, storefront: 'USA', offerType: 1,
      signedDate: now - 365 * 86_400_000, ...transaction,
    },
    renewal: {
      environment: 'Sandbox', productId: YEARLY_PRODUCT_ID, originalTransactionId: ORIGINAL_ID,
      autoRenewProductId: YEARLY_PRODUCT_ID, autoRenewStatus: 0, signedDate: now,
      ...renewal,
    },
  };
  const calls = [];
  const handler = createHandler({
    verifyRealtime: async (...args) => { calls.push(['verifyRealtime', ...args]); return context; },
    verifyNative: async (...args) => { calls.push(['verifyNative', ...args]); return proof; },
    fetchSubscriptionStatus: async (...args) => { calls.push(['fetchSubscriptionStatus', ...args]); return proof; },
    verifyNotification: async (...args) => {
      calls.push(['verifyNotification', ...args]);
      return { notification: { data: { appAppleId: DEFAULT_APP_ID, bundleId: DEFAULT_BUNDLE_ID,
        environment: 'Sandbox' }, ...notification }, transaction: null, renewal: null };
    },
    ledgerRequest: async (...args) => { calls.push(['ledgerRequest', ...args]); return { signature: SIGNATURE }; },
    ...overrides,
  });
  return { handler, env, calls, context, proof };
}

function request(path = '/v1/apple/retention', body = { signedPayload: 'test-jws' }, options = {}) {
  return new Request(`https://retention.example${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options,
  });
}

const offerBody = { signedTransactionInfo: 'test-transaction-jws', signedRenewalInfo: 'test-renewal-jws' };

test('health, unknown route and unsupported methods report bounded status and no-cache headers', async () => {
  const { handler, env, calls } = fixture();
  const health = await handler(new Request('https://retention.example/health'), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { service: 'duet-retention-api', environment: 'Sandbox', offersEnabled: true });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await handler(new Request('https://retention.example/missing'), env)).status, 404);
  assert.equal((await handler(new Request('https://retention.example/v1/apple/retention'), env)).status, 405);
  assert.equal(calls.length, 0);
});

test('invalid deployment configuration exposes no private configuration or SDK detail', async () => {
  const { handler, env } = fixture();
  const response = await handler(request(), { ...env, ENVIRONMENT: 'LocalTesting' });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'service_unconfigured' });
});

test('wrong content type, malformed JSON and non-object bodies cannot reach verification', async () => {
  const { handler, env, calls } = fixture();
  assert.equal((await handler(request(undefined, undefined, { headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  for (const body of ['{', '[]', 'null', '"value"']) {
    const response = await handler(request(undefined, undefined, { body }), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_body' });
  }
  assert.equal(calls.length, 0);
});

test('invalid UTF-8 is rejected rather than decoded into a different signed payload', async () => {
  const { handler, env, calls } = fixture();
  const response = await handler(request(undefined, undefined, {
    body: new Uint8Array([123, 34, 115, 105, 103, 110, 101, 100, 80, 97, 121, 108, 111, 97, 100, 34, 58, 34, 255, 34, 125]),
  }), env);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('unknown and missing body fields reject client-supplied identity or eligibility hints', async () => {
  const { handler, env, calls } = fixture();
  for (const body of [{}, { signedPayload: '' }, { signedPayload: 'jws', eligible: true },
    { signedPayload: 'jws', originalTransactionId: ORIGINAL_ID }]) {
    assert.equal((await handler(request(undefined, body), env)).status, 400);
  }
  assert.equal((await handler(request('/v1/offers/retention', { ...offerBody, price: 1.99 }), env)).status, 400);
  assert.equal(calls.length, 0);
});

test('advertised oversized body is rejected before reading or verification', async () => {
  const { handler, env, calls } = fixture();
  const response = await handler(request(undefined, undefined, { headers: {
    'Content-Type': 'application/json', 'Content-Length': '32769',
  } }), env);
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test('chunked body size is enforced without trusting Content-Length', async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(32_768)); controller.enqueue(new Uint8Array(1)); },
    cancel() { canceled = true; },
  });
  const { handler, env, calls } = fixture();
  const response = await handler(request(undefined, undefined, { body, duplex: 'half' }), env);
  assert.equal(response.status, 413);
  assert.equal(canceled, true);
  assert.equal(calls.length, 0);
});

test('invalid Apple JWS never chooses even the configured fallback message', async () => {
  let ledgerCalls = 0;
  const { handler, env } = fixture({ overrides: {
    verifyRealtime: async () => { throw new Error('private SDK error or signed payload'); },
    ledgerRequest: async () => { ledgerCalls++; },
  } });
  const response = await handler(request(), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'invalid_apple_request' });
  assert.equal(ledgerCalls, 0);
});

test('valid-looking forged token is rejected by the real Apple verifier', async () => {
  const { env } = fixture();
  const response = await createHandler()(request(undefined, { signedPayload: 'e30.e30.ZmFrZQ' }), env);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'invalid_apple_request' });
});

test('decoded Apple request remains bound to app ID, environment, source allowlist and fresh signedDate', async () => {
  for (const [realtime, expected] of [
    [{ appAppleId: 0 }, 401], [{ environment: 'Production' }, 401],
    [{ productId: 'com.vkohli.zoeycalendar.bundle.yearly' }, 400],
    [{ signedDate: Date.now() - 300_100 }, 401],
  ]) {
    const { handler, env, calls } = fixture({ realtime });
    assert.equal((await handler(request(), env)).status, expected);
    assert.equal(calls.some(call => call[0] === 'ledgerRequest'), false);
  }
  const { handler, env } = fixture({ campaign: { sourceProductIds: [MONTHLY_PRODUCT_ID] } });
  assert.equal((await handler(request(), env)).status, 400);
});

test('annual cancellation response contains only the monthly promotional-offer selection', async () => {
  // At cancellation time Apple calls before renewal is disabled; this differs
  // intentionally from an app-return offer, which requires disabled renewal.
  const { handler, env, calls } = fixture({ renewal: { autoRenewStatus: 1 } });
  const response = await handler(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { promotionalOffer: {
    messageIdentifier: 'test-message', promotionalOfferSignatureV2: SIGNATURE,
  } });
  const status = calls.find(call => call[0] === 'fetchSubscriptionStatus');
  assert.equal(status[1], ORIGINAL_ID);
  const ledger = calls.find(call => call[0] === 'ledgerRequest');
  assert.equal(ledger[1], 'offer');
  assert.equal(ledger[2], ORIGINAL_ID);
  assert.equal(ledger[3].campaign.targetProductId, MONTHLY_PRODUCT_ID);
});

test('only verified current matching lineage/product/storefront may issue an Apple offer', async () => {
  for (const changes of [
    { transaction: { originalTransactionId: '2000000999' }, renewal: { originalTransactionId: '2000000999' } },
    { transaction: { productId: MONTHLY_PRODUCT_ID }, renewal: { productId: MONTHLY_PRODUCT_ID, autoRenewProductId: MONTHLY_PRODUCT_ID } },
    { transaction: { storefront: 'CAN' } }, { transaction: { inAppOwnershipType: 'FAMILY_SHARED' } },
    { transaction: { revocationDate: Date.now() - 1000 } },
  ]) {
    const { handler, env, calls } = fixture(changes);
    const response = await handler(request(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: { messageIdentifier: 'test-message' } });
    assert.equal(calls.some(call => call[0] === 'ledgerRequest'), false);
  }
});

test('status lookup or ledger/signer failure degrades to the approved message only', async () => {
  for (const name of ['fetchSubscriptionStatus', 'ledgerRequest']) {
    const { handler, env } = fixture({ overrides: { [name]: async () => { throw new Error('private failure'); } } });
    const response = await handler(request(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: { messageIdentifier: 'test-message' } });
  }
});

test('a stalled current-status lookup reaches the approved fallback within a bounded wait', async () => {
  let issued = false;
  const { handler, env } = fixture({ overrides: {
    fetchSubscriptionStatus: async () => new Promise(() => {}),
    ledgerRequest: async () => { issued = true; return { signature: SIGNATURE }; },
  } });
  const started = performance.now();
  const response = await handler(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: { messageIdentifier: 'test-message' } });
  assert.equal(issued, false);
  assert.ok(performance.now() - started < 2000, 'unit watchdog, not Apple production performance certification');
});

test('disabled or ended campaigns never perform eligibility lookup or issue a token', async () => {
  for (const campaign of [{ enabled: false }, { endsAt: new Date(Date.now() - 1000).toISOString() }]) {
    const { handler, env, calls } = fixture({ campaign });
    assert.equal((await handler(request(), env)).status, 503);
    assert.equal((await handler(request('/v1/offers/retention', offerBody), env)).status, 409);
    assert.equal(calls.some(call => ['fetchSubscriptionStatus', 'ledgerRequest'].includes(call[0])), false);
  }
});

test('unconfigured locale does not produce an offer or invent a message identifier', async () => {
  const { handler, env, calls } = fixture({ realtime: { userLocale: 'fr-FR' } });
  const response = await handler(request(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).promotionalOffer, undefined);
  assert.equal(calls.some(call => call[0] === 'ledgerRequest'), false);
});

test('native app offer uses server-fetched state and returns exact campaign and monthly product', async () => {
  const { handler, env, calls } = fixture();
  const response = await handler(request('/v1/offers/retention', offerBody), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { eligible: true, campaignId: 'test-campaign',
    productId: MONTHLY_PRODUCT_ID, offerIdentifier: OFFER_ID, promotionalOfferSignatureV2: SIGNATURE });
  assert.equal(calls.filter(call => call[0] === 'verifyNative').length, 1);
  assert.equal(calls.filter(call => call[0] === 'fetchSubscriptionStatus').length, 1);
});

test('native app cannot reuse an old proof after renewal was restored or the current subscription changed', async () => {
  const original = fixture();
  for (const current of [
    { ...original.proof, renewal: { ...original.proof.renewal, autoRenewStatus: 1 } },
    { transaction: { ...original.proof.transaction, originalTransactionId: '2000000999' },
      renewal: { ...original.proof.renewal, originalTransactionId: '2000000999' } },
  ]) {
    let issued = false;
    const { handler, env } = fixture({ overrides: {
      fetchSubscriptionStatus: async () => current,
      ledgerRequest: async () => { issued = true; return { signature: SIGNATURE }; },
    } });
    const response = await handler(request('/v1/offers/retention', offerBody), env);
    assert.equal(response.status, 409);
    assert.equal(issued, false);
  }
});

test('native proof signature and identity failures do not query or issue an offer', async () => {
  for (const changes of [
    { overrides: { verifyNative: async () => { throw new Error('bad signature'); } } },
    { transaction: { bundleId: 'com.other.app' } }, { transaction: { environment: 'Production' } },
    { transaction: { inAppOwnershipType: 'FAMILY_SHARED' } },
    { transaction: { type: 'Non-Consumable' } },
    { renewal: { originalTransactionId: '2000000999' } },
  ]) {
    const { handler, env, calls } = fixture(changes);
    assert.equal((await handler(request('/v1/offers/retention', offerBody), env)).status, 401);
    assert.equal(calls.some(call => ['fetchSubscriptionStatus', 'ledgerRequest'].includes(call[0])), false);
  }
});

test('native status/ledger failures expose no SDK, subscription identity or secret detail', async () => {
  for (const name of ['fetchSubscriptionStatus', 'ledgerRequest']) {
    const { handler, env } = fixture({ overrides: { [name]: async () => { throw new Error(`private ${ORIGINAL_ID}`); } } });
    const response = await handler(request('/v1/offers/retention', offerBody), env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'temporarily_unavailable' });
  }
});

test('empty ledger output cannot be presented as a valid Apple promotional offer', async () => {
  const { handler, env } = fixture({ overrides: { ledgerRequest: async () => ({ signature: '' }) } });
  const response = await handler(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: { messageIdentifier: 'test-message' } });
  const app = await handler(request('/v1/offers/retention', offerBody), env);
  assert.equal(app.status, 503);
  assert.equal((await app.json()).eligible, undefined);
});

test('invalid notification signature and app scope cannot mutate the ledger', async () => {
  for (const changes of [
    { overrides: { verifyNotification: async () => { throw new Error('bad signature'); } } },
    { notification: { data: { appAppleId: 0, bundleId: DEFAULT_BUNDLE_ID, environment: 'Sandbox' } } },
    { notification: { data: { appAppleId: DEFAULT_APP_ID, bundleId: 'com.other.app', environment: 'Sandbox' } } },
    { notification: { data: { appAppleId: DEFAULT_APP_ID, bundleId: DEFAULT_BUNDLE_ID, environment: 'Production' } } },
  ]) {
    const { handler, env, calls } = fixture(changes);
    assert.equal((await handler(request('/v1/apple/subscription-notifications'), env)).status, 401);
    assert.equal(calls.some(call => call[0] === 'ledgerRequest'), false);
  }
});

function notificationProof({ transaction = null, renewal = null } = {}) {
  return { notification: { data: { appAppleId: DEFAULT_APP_ID, bundleId: DEFAULT_BUNDLE_ID,
    environment: 'Sandbox' } }, transaction, renewal };
}

function redeemedTransaction(overrides = {}) {
  return { bundleId: DEFAULT_BUNDLE_ID, environment: 'Sandbox', productId: MONTHLY_PRODUCT_ID,
    originalTransactionId: ORIGINAL_ID, offerIdentifier: OFFER_ID, offerType: 2, ...overrides };
}

test('verified matching monthly promotional transaction records redemption but mere notifications do not', async () => {
  for (const [proof, expected] of [
    [notificationProof(), 0],
    [notificationProof({ transaction: redeemedTransaction({ offerType: 1 }) }), 0],
    [notificationProof({ transaction: redeemedTransaction({ offerIdentifier: 'unrelated-offer' }) }), 0],
    [notificationProof({ transaction: redeemedTransaction({ productId: YEARLY_PRODUCT_ID }) }), 0],
    [notificationProof({ transaction: redeemedTransaction() }), 1],
  ]) {
    const calls = [];
    const { handler, env } = fixture({ overrides: {
      verifyNotification: async () => proof,
      ledgerRequest: async (...args) => { calls.push(args); return { recorded: true }; },
    } });
    assert.equal((await handler(request('/v1/apple/subscription-notifications'), env)).status, 200);
    assert.equal(calls.length, expected);
    if (expected) assert.deepEqual(calls[0].slice(0, 2), ['redeemed', ORIGINAL_ID]);
  }
});

test('scheduled monthly promotional offer requires matching signed renewal and transaction lineage', async () => {
  const transaction = redeemedTransaction({ productId: YEARLY_PRODUCT_ID, offerIdentifier: undefined, offerType: 1 });
  const renewal = { originalTransactionId: ORIGINAL_ID, productId: YEARLY_PRODUCT_ID,
    environment: 'Sandbox', autoRenewProductId: MONTHLY_PRODUCT_ID, offerIdentifier: OFFER_ID, offerType: 2 };
  for (const [changed, status, marked] of [
    [renewal, 200, true], [{ ...renewal, originalTransactionId: '2000000999' }, 401, false],
    [{ ...renewal, environment: 'Production' }, 401, false],
    [{ ...renewal, autoRenewProductId: YEARLY_PRODUCT_ID }, 200, false],
  ]) {
    let recorded = false;
    const { handler, env } = fixture({ overrides: {
      verifyNotification: async () => notificationProof({ transaction, renewal: changed }),
      ledgerRequest: async () => { recorded = true; return { recorded: true }; },
    } });
    assert.equal((await handler(request('/v1/apple/subscription-notifications'), env)).status, status);
    assert.equal(recorded, marked);
  }
});

test('notification cannot coerce a numeric lineage or mix proof from another app', async () => {
  for (const transaction of [redeemedTransaction({ originalTransactionId: 2000000123456789 }),
    redeemedTransaction({ bundleId: 'com.other.app' }), redeemedTransaction({ environment: 'Production' })]) {
    let called = false;
    const { handler, env } = fixture({ overrides: {
      verifyNotification: async () => notificationProof({ transaction }),
      ledgerRequest: async () => { called = true; },
    } });
    assert.equal((await handler(request('/v1/apple/subscription-notifications'), env)).status, 401);
    assert.equal(called, false);
  }
});
