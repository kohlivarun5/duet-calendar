import { Buffer } from 'node:buffer';
import { APPLE_ROOT_CA_G3_DER_BASE64 } from './apple-roots.mjs';
import { appAppleIdMatches } from './policy.mjs';

const verifiers = new Map();
let cachedSigner;
let sdkPromise;
let cachedClient;

function sdk() {
  // This dependency initializes random values. Workerd forbids that at module
  // scope, so initialize it only inside a request and reuse it thereafter.
  sdkPromise ??= import('@apple/app-store-server-library');
  return sdkPromise;
}

export async function verifier(config) {
  // Offline certificate-chain verification avoids an unbounded OCSP request on
  // Apple's 700ms callback. The policy separately requires fresh signed data.
  // Never permit Xcode/LocalTesting, whose SDK verification skips signatures.
  if (!['Sandbox', 'Production'].includes(config.environment)) throw new Error('invalid_environment');
  const key = `${config.environment}:${config.bundleId}:${config.appAppleId}`;
  if (!verifiers.has(key)) {
    const { SignedDataVerifier } = await sdk();
    verifiers.set(key, new SignedDataVerifier(
      [Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, 'base64')],
      false, config.environment, config.bundleId, config.appAppleId,
    ));
  }
  return verifiers.get(key);
}

export async function verifyRealtime(signedPayload, config) {
  return (await verifier(config)).verifyAndDecodeRealtimeRequest(signedPayload);
}

export async function verifyNative(body, config) {
  const v = await verifier(config);
  const [transaction, renewal] = await Promise.all([
    v.verifyAndDecodeTransaction(body.signedTransactionInfo),
    v.verifyAndDecodeRenewalInfo(body.signedRenewalInfo),
  ]);
  return { transaction, renewal };
}

export async function verifyNotification(signedPayload, config) {
  const v = await verifier(config);
  const notification = await v.verifyAndDecodeNotification(signedPayload);
  const transaction = notification.data?.signedTransactionInfo
    ? await v.verifyAndDecodeTransaction(notification.data.signedTransactionInfo)
    : null;
  const renewal = notification.data?.signedRenewalInfo
    ? await v.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo)
    : null;
  return { notification, transaction, renewal };
}

function signingMaterial(env) {
  const privateKey = env.IAP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const keyId = env.IAP_KEY_ID;
  const issuerId = env.IAP_ISSUER_ID;
  if (!privateKey || !keyId || !issuerId) throw new Error('signing_unconfigured');
  return { privateKey, keyId, issuerId };
}

export async function signOffer(originalTransactionId, config, env) {
  const { privateKey, keyId, issuerId } = signingMaterial(env);
  if (!cachedSigner || cachedSigner.privateKey !== privateKey
      || cachedSigner.keyId !== keyId || cachedSigner.issuerId !== issuerId) {
    const { PromotionalOfferV2SignatureCreator } = await sdk();
    cachedSigner = { privateKey, keyId, issuerId, signer:
      new PromotionalOfferV2SignatureCreator(privateKey, keyId, issuerId, config.bundleId) };
  }
  // Apple's V2 creator supplies ES256, audience, nonce, and iat. Do NOT add exp.
  // In retention messages Apple requires this original transaction binding.
  return cachedSigner.signer.createSignature(
    config.campaign.targetProductId, config.campaign.offerIdentifier, originalTransactionId,
  );
}

export async function fetchSubscriptionStatus(originalTransactionId, config, env) {
  const { privateKey, keyId, issuerId } = signingMaterial(env);
  if (!cachedClient || cachedClient.privateKey !== privateKey || cachedClient.keyId !== keyId
      || cachedClient.issuerId !== issuerId || cachedClient.environment !== config.environment) {
    const { AppStoreServerAPIClient } = await sdk();
    cachedClient = { privateKey, keyId, issuerId, environment: config.environment,
      client: new AppStoreServerAPIClient(privateKey, keyId, issuerId, config.bundleId, config.environment) };
  }
  const result = await cachedClient.client.getAllSubscriptionStatuses(originalTransactionId);
  // The official StatusResponse schema makes appAppleId optional. Permit its
  // omission only in Sandbox, while retaining exact bundle/environment checks
  // and verifying the selected active lineage's signed transaction/renewal.
  // https://github.com/apple/app-store-server-library-node/blob/v3.1.0/models/StatusResponse.ts
  if (result.bundleId !== config.bundleId
      || !appAppleIdMatches(result.appAppleId, config, { allowSandboxOmission: true })
      || result.environment !== config.environment) throw new Error('invalid_status_binding');
  const matches = (result.data ?? []).flatMap(group => group.lastTransactions ?? [])
    .filter(item => item.originalTransactionId === originalTransactionId);
  if (matches.length !== 1 || matches[0].status !== 1) throw new Error('no_active_subscription');
  return verifyNative(matches[0], config);
}

export async function subscriberKey(originalTransactionId, config, env) {
  if (typeof env.SUBSCRIBER_HASH_SECRET !== 'string' || env.SUBSCRIBER_HASH_SECRET.length < 32) {
    throw new Error('ledger_unconfigured');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SUBSCRIBER_HASH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key,
    encoder.encode(`${config.environment}:${originalTransactionId}`));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
