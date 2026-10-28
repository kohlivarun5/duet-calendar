import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, sign, verify, X509Certificate } from 'node:crypto';
import {
  signOffer, subscriberKey, verifier, verifyRealtime, verifyNative, verifyNotification,
} from '../src/apple.mjs';
import { APPLE_ROOT_CA_G3_DER_BASE64 } from '../src/apple-roots.mjs';
import { parseConfig, MONTHLY_PRODUCT_ID, DEFAULT_BUNDLE_ID } from '../src/policy.mjs';

const ORIGINAL_ID = '2000000123456789';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const testKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const issuerId = '9f890917-7697-4c31-bf31-0aab74bdb0be';
const env = { IAP_PRIVATE_KEY: testKey, IAP_KEY_ID: 'TESTKEY001', IAP_ISSUER_ID: issuerId };
const config = parseConfig({ RETENTION_CAMPAIGN_JSON: JSON.stringify({
  id: 'test-campaign', enabled: true, offerIdentifier: 'test-monthly-offer',
  targetProductId: MONTHLY_PRODUCT_ID,
  messageIdentifiers: { 'en-US': 'test-message' },
  startsAt: '2026-01-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z',
}) });

function decode(token) {
  const [header, body, signature] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url')),
    body: JSON.parse(Buffer.from(body, 'base64url')),
    signature: Buffer.from(signature, 'base64url'),
    signingInput: Buffer.from(`${header}.${body}`),
  };
}

test('bundled Apple trust anchor is the pinned official G3 certificate', () => {
  const der = Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, 'base64');
  const certificate = new X509Certificate(der);
  assert.match(certificate.subject, /Apple Root CA - G3/);
  assert.equal(createHash('sha256').update(der).digest('hex'),
    '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179');
});

test('official V2 signer creates a verifiable ES256 monthly offer bound to the original subscription', async () => {
  const before = Math.floor(Date.now() / 1000);
  const token = await signOffer(ORIGINAL_ID, config, env);
  const { header, body, signature, signingInput } = decode(token);
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, 'TESTKEY001');
  assert.equal(body.iss, issuerId);
  assert.equal(body.aud, 'promotional-offer');
  assert.equal(body.bid, DEFAULT_BUNDLE_ID);
  assert.equal(body.productId, MONTHLY_PRODUCT_ID);
  assert.equal(body.offerIdentifier, 'test-monthly-offer');
  assert.equal(body.transactionId, ORIGINAL_ID);
  assert.equal(body.exp, undefined, 'Apple V2 offer payload must not add an exp claim');
  assert.ok(Number.isInteger(body.iat) && body.iat >= before && body.iat <= Math.floor(Date.now() / 1000));
  assert.match(body.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(signature.length, 64);
  assert.equal(verify('sha256', signingInput, { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, signature), true);
  const tampered = Buffer.from(signingInput.toString().replace('eyJ', 'eyK'));
  assert.equal(verify('sha256', tampered, { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, signature), false);
});

test('each uncached offer gets a fresh nonce, even within one second', async () => {
  const first = decode(await signOffer(ORIGINAL_ID, config, env));
  const second = decode(await signOffer(ORIGINAL_ID, config, env));
  assert.notEqual(first.body.nonce, second.body.nonce);
  assert.notEqual(first.signature.toString('hex'), second.signature.toString('hex'));
});

test('escaped-PEM configuration and signing-key rotation work without retaining the previous signer', async () => {
  const rotated = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rotatedEnv = {
    IAP_PRIVATE_KEY: rotated.privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'),
    IAP_KEY_ID: 'TESTKEY002', IAP_ISSUER_ID: 'c60bbba2-883b-47ce-b727-9c2df61071d2',
  };
  const token = decode(await signOffer(ORIGINAL_ID, config, rotatedEnv));
  assert.equal(token.header.kid, 'TESTKEY002');
  assert.equal(token.body.iss, rotatedEnv.IAP_ISSUER_ID);
  assert.equal(verify('sha256', token.signingInput,
    { key: rotated.publicKey, dsaEncoding: 'ieee-p1363' }, token.signature), true);
  assert.equal(verify('sha256', token.signingInput,
    { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, token.signature), false);
});

test('missing signer configuration never produces a token', async () => {
  for (const field of ['IAP_PRIVATE_KEY', 'IAP_KEY_ID', 'IAP_ISSUER_ID']) {
    await assert.rejects(async () => signOffer(ORIGINAL_ID, config, { ...env, [field]: undefined }), /signing_unconfigured/);
  }
});

test('SDK verifiers reject local-testing environments that could skip Apple signatures', async () => {
  for (const environment of ['Xcode', 'LocalTesting', 'sandbox']) {
    await assert.rejects(async () => verifier({ ...config, environment }), /invalid_environment/);
  }
});

test('SDK verification rejects malformed JWS and self-signed attacker tokens', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ originalTransactionId: ORIGINAL_ID,
    environment: 'Sandbox', signedDate: Date.now() })).toString('base64url');
  const signature = sign('sha256', Buffer.from(`${header}.${body}`),
    { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  for (const jws of ['not-a-jws', `${header}.${body}.${signature}`]) {
    await assert.rejects(() => verifyRealtime(jws, config));
    await assert.rejects(() => verifyNative({ signedTransactionInfo: jws, signedRenewalInfo: jws }, config));
    await assert.rejects(() => verifyNotification(jws, config));
  }
});

test('subscriber actor names are keyed HMACs separated by environment and lineage', async () => {
  const secret = 'test-only-hmac-secret-never-used-in-production';
  const first = await subscriberKey(ORIGINAL_ID, config, { SUBSCRIBER_HASH_SECRET: secret });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, createHmac('sha256', secret).update(`Sandbox:${ORIGINAL_ID}`).digest('hex'));
  assert.equal(first, await subscriberKey(ORIGINAL_ID, config, { SUBSCRIBER_HASH_SECRET: secret }));
  assert.notEqual(first, await subscriberKey('2000000999', config, { SUBSCRIBER_HASH_SECRET: secret }));
  assert.notEqual(first, await subscriberKey(ORIGINAL_ID, { ...config, environment: 'Production' }, { SUBSCRIBER_HASH_SECRET: secret }));
  assert.notEqual(first, await subscriberKey(ORIGINAL_ID, config, { SUBSCRIBER_HASH_SECRET: `${secret}-rotated` }));
  assert.equal(first.includes(ORIGINAL_ID), false);
});

test('subscriber hashing refuses missing or weak secrets', async () => {
  await assert.rejects(() => subscriberKey(ORIGINAL_ID, config, {}), /ledger_unconfigured/);
  await assert.rejects(() => subscriberKey(ORIGINAL_ID, config, { SUBSCRIBER_HASH_SECRET: 'short' }), /ledger_unconfigured/);
});
