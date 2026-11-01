import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APP_ID, DEFAULT_BUNDLE_ID, MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID,
  PolicyError, parseConfig, validateRealtimeRequest, evaluateNativeEligibility,
} from '../src/policy.mjs';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const ORIGINAL_ID = '2000000123456789';
const UUID = '912ebd5e-6f60-4c5a-a3d4-1e0fdcdb9070';

function campaign(overrides = {}) {
  return {
    id: 'monthly-retention-v1', enabled: true,
    offerIdentifier: 'monthly-199-v1', targetProductId: MONTHLY_PRODUCT_ID,
    sourceProductIds: [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID],
    messageIdentifiers: { 'en-US': 'retain-monthly-v1' },
    startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z',
    storefronts: ['USA'], ...overrides,
  };
}

function config(overrides = {}, environment = 'Sandbox') {
  return parseConfig({ ENVIRONMENT: environment, RETENTION_CAMPAIGN_JSON: JSON.stringify(campaign(overrides)) });
}

function request(overrides = {}) {
  return {
    appAppleId: DEFAULT_APP_ID, productId: YEARLY_PRODUCT_ID,
    environment: 'Sandbox', originalTransactionId: ORIGINAL_ID,
    requestIdentifier: UUID, userLocale: 'en-US', signedDate: NOW, ...overrides,
  };
}

function native(transactionOverrides = {}, renewalOverrides = {}) {
  return [
    {
      bundleId: DEFAULT_BUNDLE_ID, environment: 'Sandbox', productId: YEARLY_PRODUCT_ID,
      originalTransactionId: ORIGINAL_ID, type: 'Auto-Renewable Subscription',
      inAppOwnershipType: 'PURCHASED', expiresDate: NOW + 86_400_000,
      storefront: 'USA', signedDate: NOW - 30 * 86_400_000,
      offerType: 1, offerDiscountType: 'FREE_TRIAL', ...transactionOverrides,
    },
    {
      environment: 'Sandbox', productId: YEARLY_PRODUCT_ID, originalTransactionId: ORIGINAL_ID,
      autoRenewProductId: YEARLY_PRODUCT_ID, autoRenewStatus: 0,
      expirationIntent: 1, signedDate: NOW, isInBillingRetryPeriod: false,
      ...renewalOverrides,
    },
  ];
}

function evaluate(transactionOverrides, renewalOverrides, options = {}) {
  return evaluateNativeEligibility(...native(transactionOverrides, renewalOverrides), options.config ?? config(), options.now ?? NOW);
}

function rejectsPolicy(fn, code, status) {
  assert.throws(fn, error => error instanceof PolicyError
    && error.code === code && (status === undefined || error.status === status));
}

test('deployment defaults are Sandbox and disabled with fixed app identity', () => {
  const parsed = parseConfig();
  assert.equal(parsed.environment, 'Sandbox');
  assert.equal(parsed.appAppleId, DEFAULT_APP_ID);
  assert.equal(parsed.bundleId, DEFAULT_BUNDLE_ID);
  assert.equal(parsed.campaign.enabled, false);
  assert.equal(parsed.campaign.targetProductId, MONTHLY_PRODUCT_ID);
  assert.equal(evaluateNativeEligibility(null, null, parsed, NOW).reason, 'campaign_disabled');
});

test('config validates enabled campaign and freezes its normalized bounds and collections', () => {
  const parsed = config();
  assert.equal(parsed.campaign.startsAt, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(parsed.campaign.endsAt, Date.parse('2026-12-01T00:00:00Z'));
  assert.equal(parsed.campaign.messageIdentifiers['en-US'], 'retain-monthly-v1');
  assert.ok(Object.isFrozen(parsed.campaign.sourceProductIds));
  assert.ok(Object.isFrozen(parsed.campaign.messageIdentifiers));
});

test('invalid JSON and misspelled config are fail-closed', () => {
  rejectsPolicy(() => parseConfig({ RETENTION_CAMPAIGN_JSON: '{' }), 'invalid_campaign_json', 500);
  rejectsPolicy(() => config({ enabeld: true }), 'unknown_campaign_field', 500);
  rejectsPolicy(() => config({ enabled: 'true' }), 'invalid_campaign_enabled', 500);
  rejectsPolicy(() => parseConfig({ ENVIRONMENT: 'production' }), 'invalid_environment_configuration', 500);
});

test('enabled config cannot omit offer, default message, dates, or campaign identity', () => {
  for (const field of ['id', 'offerIdentifier', 'startsAt', 'endsAt']) {
    assert.throws(() => config({ [field]: null }), PolicyError);
  }
  rejectsPolicy(() => config({ messageIdentifiers: { 'fr-FR': 'fr-message' } }), 'missing_campaign_default_message', 500);
  rejectsPolicy(() => config({ offerIdentifier: 'offer\nheader' }), 'invalid_campaign_offer_identifier', 500);
});

test('config rejects unsupported products, duplicate sources, and non-USA rollout', () => {
  rejectsPolicy(() => config({ targetProductId: YEARLY_PRODUCT_ID }), 'invalid_campaign_target_product', 500);
  rejectsPolicy(() => config({ sourceProductIds: ['com.vkohli.other.monthly'] }), 'invalid_campaign_source_product', 500);
  rejectsPolicy(() => config({ sourceProductIds: [MONTHLY_PRODUCT_ID, MONTHLY_PRODUCT_ID] }), 'invalid_campaign_source_products', 500);
  rejectsPolicy(() => config({ storefronts: ['USA', 'CAN'] }), 'unsupported_campaign_storefront', 500);
});

test('invalid, normalized-overflow, unzoned and reversed campaign dates are rejected', () => {
  for (const value of ['2026-02-31T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-01', '2026-10-01T24:00:00Z']) {
    assert.throws(() => config({ startsAt: value }), PolicyError);
  }
  rejectsPolicy(() => config({ endsAt: '2026-10-01T00:00:00Z' }), 'invalid_campaign_window', 500);
});

test('realtime normalization preserves string transaction IDs without numeric precision loss', () => {
  const result = validateRealtimeRequest(request({ originalTransactionId: '18446744073709551615' }), config(), NOW);
  assert.equal(result.originalTransactionId, '18446744073709551615');
  assert.equal(result.sourceProductId, YEARLY_PRODUCT_ID);
  assert.equal(result.requestIdentifier, UUID);
  assert.ok(Object.isFrozen(result));
});

test('Sandbox still requires the real application Apple ID', () => {
  rejectsPolicy(() => validateRealtimeRequest(request({ appAppleId: undefined }), config(), NOW), 'app_identity_mismatch', 401);
  rejectsPolicy(() => validateRealtimeRequest(request({ appAppleId: 0 }), config(), NOW), 'app_identity_mismatch', 401);
  rejectsPolicy(() => validateRealtimeRequest(request({ appAppleId: String(DEFAULT_APP_ID) }), config(), NOW), 'app_identity_mismatch', 401);
});

test('realtime environment and source product are strictly bound', () => {
  rejectsPolicy(() => validateRealtimeRequest(request({ environment: 'Production' }), config(), NOW), 'environment_mismatch', 401);
  rejectsPolicy(() => validateRealtimeRequest(request({ productId: 'com.vkohli.zoeycalendar.bundle.yearly' }), config(), NOW), 'unsupported_source_product', 400);
  rejectsPolicy(() => validateRealtimeRequest(request(), config({ sourceProductIds: [MONTHLY_PRODUCT_ID] }), NOW), 'unsupported_source_product', 400);
});

test('realtime IDs, UUID, locale, and timestamp have validated shape', () => {
  for (const originalTransactionId of ['', 2000000123456789, '12.3', '1e19', '-2', '2/3']) {
    rejectsPolicy(() => validateRealtimeRequest(request({ originalTransactionId }), config(), NOW), 'invalid_original_transaction_id');
  }
  rejectsPolicy(() => validateRealtimeRequest(request({ requestIdentifier: 'request-1' }), config(), NOW), 'invalid_request_identifier');
  rejectsPolicy(() => validateRealtimeRequest(request({ userLocale: '../../en-US' }), config(), NOW), 'invalid_user_locale');
  rejectsPolicy(() => validateRealtimeRequest(request({ signedDate: String(NOW) }), config(), NOW), 'invalid_request_signed_date');
});

test('realtime signedDate accepts exact freshness/skew boundaries, rejects one millisecond beyond', () => {
  validateRealtimeRequest(request({ signedDate: NOW - 300_000 }), config(), NOW);
  validateRealtimeRequest(request({ signedDate: NOW + 60_000 }), config(), NOW);
  rejectsPolicy(() => validateRealtimeRequest(request({ signedDate: NOW - 300_001 }), config(), NOW), 'stale_realtime_request', 401);
  rejectsPolicy(() => validateRealtimeRequest(request({ signedDate: NOW + 60_001 }), config(), NOW), 'future_realtime_request', 401);
});

test('zero-paid annual introductory trial is eligible after voluntary cancellation', () => {
  assert.deepEqual(evaluate(), {
    eligible: true, reason: 'eligible', originalTransactionId: ORIGINAL_ID, sourceProductId: YEARLY_PRODUCT_ID,
  });
});

test('old transaction signature is not mistaken for stale current renewal state', () => {
  assert.equal(evaluate({ signedDate: NOW - 365 * 86_400_000 }).eligible, true);
  assert.equal(evaluate({}, { signedDate: NOW - 300_001 }).reason, 'stale_renewal');
  assert.equal(evaluate({}, { signedDate: NOW + 60_001 }).reason, 'future_renewal');
  rejectsPolicy(() => evaluate({}, { signedDate: undefined }), 'invalid_renewal_signed_date', 401);
});

test('freshly canceled standard paid monthly term is eligible', () => {
  const result = evaluate({ productId: MONTHLY_PRODUCT_ID, offerType: undefined }, {
    productId: MONTHLY_PRODUCT_ID, autoRenewProductId: MONTHLY_PRODUCT_ID, expirationIntent: undefined,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.sourceProductId, MONTHLY_PRODUCT_ID);
});

test('campaign is inactive outside its start-inclusive/end-exclusive period', () => {
  const parsed = config();
  assert.equal(evaluate({}, {}, { config: parsed, now: parsed.campaign.startsAt - 1 }).reason, 'campaign_not_started');
  assert.equal(evaluate({}, {}, { config: parsed, now: parsed.campaign.endsAt }).reason, 'campaign_ended');
});

test('native claims cannot cross bundle, environment, original lineage, or source product', () => {
  rejectsPolicy(() => evaluate({ bundleId: 'com.other.app' }), 'bundle_identity_mismatch', 401);
  rejectsPolicy(() => evaluate({ environment: 'Production' }), 'native_environment_mismatch', 401);
  rejectsPolicy(() => evaluate({}, { environment: 'Production' }), 'native_environment_mismatch', 401);
  rejectsPolicy(() => evaluate({}, { bundleId: 'com.other.app' }), 'renewal_bundle_identity_mismatch', 401);
  rejectsPolicy(() => evaluate({}, { originalTransactionId: '2000000999' }), 'native_lineage_mismatch', 401);
  rejectsPolicy(() => evaluate({}, { productId: MONTHLY_PRODUCT_ID }), 'native_product_mismatch', 401);
  rejectsPolicy(() => evaluate({ productId: 'com.vkohli.other.yearly' }), 'native_source_product_mismatch', 401);
});

test('Family Sharing and non-subscription purchases are excluded without promoting access', () => {
  assert.equal(evaluate({ inAppOwnershipType: 'FAMILY_SHARED' }).reason, 'not_purchased');
  assert.equal(evaluate({ inAppOwnershipType: undefined }).eligible, false);
  assert.equal(evaluate({ type: 'Non-Consumable' }).reason, 'not_auto_renewable');
});

test('an upgraded source transaction cannot qualify through either the app or cancellation callback', () => {
  const [transaction, renewal] = native({ isUpgraded: true });
  assert.equal(evaluateNativeEligibility(transaction, renewal, config(), NOW).reason, 'upgraded_transaction');
  assert.equal(evaluateNativeEligibility(transaction, renewal, config(), NOW,
    { cancellationFlow: true }).reason, 'upgraded_transaction');
});

test('only the explicit cancellation callback may offer before Apple disables renewal', () => {
  const [transaction, renewal] = native({}, { autoRenewStatus: 1 });
  assert.equal(evaluateNativeEligibility(transaction, renewal, config(), NOW,
    { cancellationFlow: true }).eligible, true);
  for (const options of [undefined, {}, { cancellationFlow: false }, { cancellationFlow: 'true' }]) {
    const decision = evaluateNativeEligibility(transaction, renewal, config(), NOW, options);
    assert.equal(decision.eligible, false);
    assert.equal(decision.reason, 'renewal_enabled_or_unknown');
  }
});

test('cancellation-flow flag does not convert unknown renewal or billing failure into eligibility', () => {
  for (const autoRenewStatus of [undefined, null, false, '1', 2]) {
    assert.equal(evaluateNativeEligibility(...native({}, { autoRenewStatus }), config(), NOW,
      { cancellationFlow: true }).reason, 'renewal_unknown');
  }
  assert.equal(evaluateNativeEligibility(...native({}, { autoRenewStatus: 1, isInBillingRetryPeriod: true }),
    config(), NOW, { cancellationFlow: true }).reason, 'billing_retry');
});

test('expired, revoked, malformed expiration and unknown renewal are excluded', () => {
  assert.equal(evaluate({ expiresDate: NOW }).reason, 'expired_or_invalid_term');
  assert.equal(evaluate({ expiresDate: String(NOW + 1000) }).reason, 'expired_or_invalid_term');
  assert.equal(evaluate({ revocationDate: NOW - 1000 }).reason, 'revoked');
  assert.equal(evaluate({ revocationReason: 0 }).reason, 'revoked');
  for (const autoRenewStatus of [1, undefined, false, '0']) {
    assert.equal(evaluate({}, { autoRenewStatus }).reason, 'renewal_enabled_or_unknown');
  }
});

test('billing failure, grace and nonvoluntary expiration cannot qualify as voluntary churn', () => {
  assert.equal(evaluate({}, { isInBillingRetryPeriod: true }).reason, 'billing_retry');
  assert.equal(evaluate({}, { gracePeriodExpiresDate: NOW + 1000 }).reason, 'grace_period');
  for (const expirationIntent of [2, 3, 4, 5, '1']) {
    assert.equal(evaluate({}, { expirationIntent }).reason, 'not_voluntary_cancellation');
  }
});

test('malformed billing/grace fields are not silently interpreted as a healthy canceled term', () => {
  for (const isInBillingRetryPeriod of ['true', 1, null]) {
    assert.equal(evaluate({}, { isInBillingRetryPeriod }).reason, 'invalid_billing_state');
  }
  for (const gracePeriodExpiresDate of ['1793188800000', -1, false]) {
    assert.equal(evaluate({}, { gracePeriodExpiresDate }).reason, 'invalid_grace_period');
  }
});

test('only the transaction storefront establishes rollout eligibility', () => {
  assert.equal(evaluate({ storefront: 'CAN' }).reason, 'unsupported_storefront');
  assert.equal(evaluate({ storefront: undefined }).reason, 'unsupported_storefront');
});

test('queued plan change or existing retention/codes/promotional/win-back discounts suppress offers', () => {
  assert.equal(evaluate({}, { autoRenewProductId: MONTHLY_PRODUCT_ID }).reason, 'plan_change_pending');
  for (const offerType of [2, 3, 4, 5]) {
    assert.equal(evaluate({ offerType }).reason, 'discount_already_active_or_scheduled');
    assert.equal(evaluate({}, { offerType }).reason, 'discount_already_active_or_scheduled');
  }
  assert.equal(evaluate({ offerIdentifier: 'monthly-199-v1' }).reason, 'campaign_already_redeemed');
  assert.equal(evaluate({}, { offerIdentifier: 'monthly-199-v1' }).reason, 'campaign_already_redeemed');
});

test('unknown or wrong-type offer enums fail closed while introductory trials remain eligible', () => {
  for (const offerType of ['2', 0, 6, null, 1.5]) {
    assert.equal(evaluate({ offerType }).reason, 'unsupported_offer_type');
    assert.equal(evaluate({}, { offerType }).reason, 'unsupported_offer_type');
  }
  assert.equal(evaluate({ offerType: 1 }).eligible, true);
});

test('Production needs mutually Production native proof as well as configuration', () => {
  const parsed = config({}, 'Production');
  const [transaction, renewal] = native({ environment: 'Production' }, { environment: 'Production' });
  assert.equal(evaluateNativeEligibility(transaction, renewal, parsed, NOW).eligible, true);
  rejectsPolicy(() => evaluateNativeEligibility(transaction, { ...renewal, environment: 'Sandbox' }, parsed, NOW), 'native_environment_mismatch', 401);
});
