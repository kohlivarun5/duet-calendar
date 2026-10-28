import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { RetentionLedger } from '../src/ledger.mjs';
import { MONTHLY_PRODUCT_ID } from '../src/policy.mjs';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const ORIGINAL_ID = '2000000123456789';
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

function campaign(overrides = {}) {
  return {
    id: 'test-campaign', enabled: true, offerIdentifier: 'test-monthly-offer',
    targetProductId: MONTHLY_PRODUCT_ID, messageIdentifiers: { 'en-US': 'test-message' },
    startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', ...overrides,
  };
}

function fixture(overrides = {}) {
  const stored = new Map();
  let queue = Promise.resolve();
  const storage = {
    async get(name) { return structuredClone(stored.get(name)); },
    async put(name, value) { stored.set(name, structuredClone(value)); },
    transaction(fn) {
      const result = queue.then(() => fn(storage));
      queue = result.catch(() => {});
      return result;
    },
  };
  const env = {
    ENVIRONMENT: 'Sandbox', RETENTION_CAMPAIGN_JSON: JSON.stringify(campaign(overrides)),
    IAP_PRIVATE_KEY: key.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    IAP_KEY_ID: 'TESTKEY001', IAP_ISSUER_ID: '9f890917-7697-4c31-bf31-0aab74bdb0be',
  };
  return { ledger: new RetentionLedger({ storage }, env), stored, env, storage };
}

function request(path = '/offer', overrides = {}, method = 'POST') {
  return new Request(`https://ledger.internal${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ originalTransactionId: ORIGINAL_ID,
      campaignId: 'test-campaign', ...overrides }) }),
  });
}

function payload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
}

// A cold SDK import exposed this race in the runtime. Pause around the real
// cryptographic operation so the regression does not depend on loader timing.
test('confirmed redemption during asynchronous SDK signing prevents an offer and clears the cache', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger, stored } = fixture();
  const { PromotionalOfferV2SignatureCreator } = await import('@apple/app-store-server-library');
  const realCreateSignature = PromotionalOfferV2SignatureCreator.prototype.createSignature;
  let started;
  const signingStarted = new Promise(resolve => { started = resolve; });
  let resume;
  const signingMayFinish = new Promise(resolve => { resume = resolve; });
  t.mock.method(PromotionalOfferV2SignatureCreator.prototype, 'createSignature', async function (...args) {
    started();
    await signingMayFinish;
    return realCreateSignature.apply(this, args);
  });
  const offering = ledger.fetch(request());
  await signingStarted;
  await new Promise(resolve => setTimeout(resolve, 0));
  try {
    const redemption = await ledger.fetch(request('/redeemed'));
    assert.equal(redemption.status, 200);
    assert.equal(stored.get('redeemed:test-campaign'), true);
  } finally {
    resume();
  }
  const response = await offering;
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'already_redeemed' });
  assert.equal(ledger.cached, null, 'a late signer completion must not resurrect a cached offer');
});

test('ledger retains no raw lineage, token or key in durable storage', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger, stored, env } = fixture();
  const response = await ledger.fetch(request());
  assert.equal(response.status, 200);
  const { signature } = await response.json();
  assert.equal(payload(signature).transactionId, ORIGINAL_ID);
  const serialized = JSON.stringify([...stored.entries()]);
  assert.equal(serialized.includes(ORIGINAL_ID), false);
  assert.equal(serialized.includes(signature), false);
  assert.equal(serialized.includes(env.IAP_PRIVATE_KEY), false);
  assert.deepEqual([...stored.keys()], ['rate']);
});

test('offer issuance caches in memory but does not count as confirmed redemption', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger, stored } = fixture();
  const first = await (await ledger.fetch(request())).json();
  const second = await (await ledger.fetch(request())).json();
  assert.equal(first.signature, second.signature);
  assert.equal(stored.has('redeemed:test-campaign'), false);
});

test('only explicit confirmed redemption blocks later offers, including after actor restart', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger, stored, storage, env } = fixture();
  assert.equal((await ledger.fetch(request('/redeemed'))).status, 200);
  assert.equal(stored.get('redeemed:test-campaign'), true);
  assert.equal(ledger.cached, null);
  const restarted = new RetentionLedger({ storage }, env);
  const response = await restarted.fetch(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'already_redeemed' });
});

test('redemption is idempotent and a wrong campaign cannot mark the actor', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger, stored } = fixture();
  assert.equal((await ledger.fetch(request('/redeemed', { campaignId: 'other' }))).status, 400);
  assert.equal(stored.size, 0);
  assert.equal((await ledger.fetch(request('/redeemed'))).status, 200);
  assert.equal((await ledger.fetch(request('/redeemed'))).status, 200);
  assert.equal(stored.get('redeemed:test-campaign'), true);
});

test('per-lineage rate limit applies to cached signatures and resets in the next minute', async t => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const { ledger } = fixture();
  for (let i = 0; i < 12; i++) assert.equal((await ledger.fetch(request())).status, 200);
  const limited = await ledger.fetch(request());
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  now += 60_000;
  assert.equal((await ledger.fetch(request())).status, 200);
});

test('concurrent offer requests cannot bypass the serialized rate budget', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger } = fixture();
  const responses = await Promise.all(Array.from({ length: 20 }, () => ledger.fetch(request())));
  assert.equal(responses.filter(response => response.status === 200).length, 12);
  assert.equal(responses.filter(response => response.status === 429).length, 8);
});

test('cache expires at sixty seconds and new signatures carry a fresh nonce', async t => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const { ledger } = fixture();
  const first = await (await ledger.fetch(request())).json();
  now += 59_999;
  const cached = await (await ledger.fetch(request())).json();
  assert.equal(first.signature, cached.signature);
  now += 1;
  const fresh = await (await ledger.fetch(request())).json();
  assert.notEqual(payload(first.signature).nonce, payload(fresh.signature).nonce);
});

test('missing signing configuration issues no response token or durable signature', async t => {
  t.mock.method(Date, 'now', () => NOW);
  const { ledger, stored, env } = fixture();
  delete env.IAP_PRIVATE_KEY;
  await assert.rejects(() => ledger.fetch(request()), /signing_unconfigured/);
  assert.equal(ledger.cached, null);
  assert.equal(JSON.stringify([...stored.entries()]).includes(ORIGINAL_ID), false);
});

test('disabled campaign, bad lineage and unknown action never issue a signature', async t => {
  t.mock.method(Date, 'now', () => NOW);
  assert.equal((await fixture({ enabled: false }).ledger.fetch(request())).status, 409);
  const { ledger } = fixture();
  for (const bad of ['', '123/4', 'abc']) {
    assert.equal((await ledger.fetch(request('/offer', { originalTransactionId: bad }))).status, 409);
  }
  assert.equal((await ledger.fetch(request('/unknown'))).status, 409);
});

test('campaign cannot issue an offer before its start or at/after its end', async t => {
  t.mock.method(Date, 'now', () => NOW);
  for (const overrides of [
    { startsAt: '2026-10-29T00:00:00Z' },
    { endsAt: '2026-10-28T12:00:00Z' },
  ]) {
    const { ledger, stored } = fixture(overrides);
    const response = await ledger.fetch(request());
    assert.equal(response.status, 409);
    assert.equal(stored.size, 0);
  }
});

test('campaign ending invalidates an otherwise fresh cached token', async t => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const { ledger } = fixture({ endsAt: '2026-10-28T12:00:01Z' });
  assert.equal((await ledger.fetch(request())).status, 200);
  now += 1000;
  const response = await ledger.fetch(request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).signature, undefined);
});

test('unsupported internal method is rejected before trying to parse an empty GET body', async () => {
  const { ledger } = fixture();
  const response = await ledger.fetch(request('/offer', {}, 'GET'));
  assert.equal(response.status, 400);
});
