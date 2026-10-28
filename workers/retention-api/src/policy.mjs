export const DEFAULT_BUNDLE_ID = 'com.vkohli.ZoeyCalendar';
export const DEFAULT_APP_ID = 6756833862;
export const MONTHLY_PRODUCT_ID = 'com.vkohli.zoeycalendar.shared.monthly';
export const YEARLY_PRODUCT_ID = 'com.vkohli.zoeycalendar.shared.yearly';

const PRODUCTS = new Set([MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID]);
const ENVIRONMENTS = new Set(['Sandbox', 'Production']);
const CAMPAIGN_FIELDS = new Set([
  'id', 'enabled', 'offerIdentifier', 'targetProductId', 'sourceProductIds',
  'messageIdentifiers', 'startsAt', 'endsAt', 'storefronts',
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TRANSACTION_ID = /^\d{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 1000;
const DISCOUNT_OFFER_TYPES = new Set([2, 3, 4, 5]);

export class PolicyError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'PolicyError';
    this.code = code;
    this.status = status;
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, code, status = 400) {
  if (!condition) throw new PolicyError(code, status);
}

function identifier(value, field, required) {
  if (value === undefined || value === null) {
    assert(!required, `missing_campaign_${field}`, 500);
    return null;
  }
  assert(typeof value === 'string' && IDENTIFIER.test(value), `invalid_campaign_${field}`, 500);
  return value;
}

function timestamp(value, field, required) {
  if (value === undefined || value === null) {
    assert(!required, `missing_campaign_${field}`, 500);
    return null;
  }
  assert(typeof value === 'string', `invalid_campaign_${field}`, 500);
  // Require an explicit UTC time and reject dates Date.parse would normalize.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  assert(match !== null, `invalid_campaign_${field}`, 500);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  assert(year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth
    && hour <= 23 && minute <= 59 && second <= 59, `invalid_campaign_${field}`, 500);
  const parsed = Date.parse(value);
  assert(Number.isSafeInteger(parsed), `invalid_campaign_${field}`, 500);
  return parsed;
}

function stringList(value, fallback, field) {
  const list = value === undefined ? fallback : value;
  assert(Array.isArray(list) && list.length > 0 && list.every(item => typeof item === 'string')
    && new Set(list).size === list.length, `invalid_campaign_${field}`, 500);
  return [...list];
}

/** Parse deployment configuration. No caller-controlled bundle/app overrides are accepted. */
export function parseConfig(env = {}) {
  assert(record(env), 'invalid_configuration', 500);
  const environment = env.ENVIRONMENT ?? 'Sandbox';
  assert(ENVIRONMENTS.has(environment), 'invalid_environment_configuration', 500);

  let input = {};
  if (env.RETENTION_CAMPAIGN_JSON !== undefined && env.RETENTION_CAMPAIGN_JSON !== '') {
    assert(typeof env.RETENTION_CAMPAIGN_JSON === 'string'
      && env.RETENTION_CAMPAIGN_JSON.length <= 16_384, 'invalid_campaign_json', 500);
    try {
      input = JSON.parse(env.RETENTION_CAMPAIGN_JSON);
    } catch {
      throw new PolicyError('invalid_campaign_json', 500);
    }
  }
  assert(record(input), 'invalid_campaign_configuration', 500);
  assert(Object.keys(input).every(key => CAMPAIGN_FIELDS.has(key)), 'unknown_campaign_field', 500);
  assert(input.enabled === undefined || typeof input.enabled === 'boolean', 'invalid_campaign_enabled', 500);
  const enabled = input.enabled === true;
  const id = identifier(input.id, 'id', enabled);
  const offerIdentifier = identifier(input.offerIdentifier, 'offer_identifier', enabled);
  const targetProductId = input.targetProductId ?? MONTHLY_PRODUCT_ID;
  assert(targetProductId === MONTHLY_PRODUCT_ID, 'invalid_campaign_target_product', 500);
  const sourceProductIds = stringList(input.sourceProductIds, [...PRODUCTS], 'source_products');
  assert(sourceProductIds.every(product => PRODUCTS.has(product)), 'invalid_campaign_source_product', 500);
  const storefronts = stringList(input.storefronts, ['USA'], 'storefronts');
  assert(storefronts.length === 1 && storefronts[0] === 'USA', 'unsupported_campaign_storefront', 500);

  const messages = input.messageIdentifiers ?? {};
  assert(record(messages), 'invalid_campaign_messages', 500);
  const messageIdentifiers = Object.create(null);
  for (const [locale, message] of Object.entries(messages)) {
    assert(LOCALE.test(locale) && locale.length <= 35, 'invalid_campaign_message_locale', 500);
    messageIdentifiers[locale] = identifier(message, 'message_identifier', true);
  }
  assert(!enabled || Object.hasOwn(messageIdentifiers, 'en-US'), 'missing_campaign_default_message', 500);
  const startsAt = timestamp(input.startsAt, 'starts_at', enabled);
  const endsAt = timestamp(input.endsAt, 'ends_at', enabled);
  assert((startsAt === null && endsAt === null)
    || (startsAt !== null && endsAt !== null && startsAt < endsAt), 'invalid_campaign_window', 500);

  return Object.freeze({
    environment,
    bundleId: DEFAULT_BUNDLE_ID,
    appAppleId: DEFAULT_APP_ID,
    campaign: Object.freeze({
      id, enabled, offerIdentifier, targetProductId,
      sourceProductIds: Object.freeze(sourceProductIds),
      storefronts: Object.freeze(storefronts),
      messageIdentifiers: Object.freeze(messageIdentifiers),
      startsAt, endsAt,
    }),
  });
}

function signedTime(value, code, status = 400) {
  assert(Number.isSafeInteger(value) && value > 0, code, status);
  return value;
}

function validClock(now) {
  assert(Number.isSafeInteger(now) && now > 0, 'invalid_policy_clock', 500);
}

/** Validate the decoded, cryptographically verified Apple realtime request. */
export function validateRealtimeRequest(payload, config, now = Date.now()) {
  validClock(now);
  assert(record(payload), 'invalid_realtime_request');
  assert(payload.appAppleId === config.appAppleId, 'app_identity_mismatch', 401);
  assert(ENVIRONMENTS.has(payload.environment), 'invalid_request_environment');
  assert(payload.environment === config.environment, 'environment_mismatch', 401);
  assert(typeof payload.originalTransactionId === 'string'
    && TRANSACTION_ID.test(payload.originalTransactionId), 'invalid_original_transaction_id');
  assert(typeof payload.productId === 'string' && PRODUCTS.has(payload.productId)
    && config.campaign.sourceProductIds.includes(payload.productId), 'unsupported_source_product');
  assert(typeof payload.requestIdentifier === 'string' && UUID.test(payload.requestIdentifier), 'invalid_request_identifier');
  assert(typeof payload.userLocale === 'string' && payload.userLocale.length <= 35
    && LOCALE.test(payload.userLocale), 'invalid_user_locale');
  const signedDate = signedTime(payload.signedDate, 'invalid_request_signed_date');
  assert(signedDate >= now - MAX_AGE_MS, 'stale_realtime_request', 401);
  assert(signedDate <= now + MAX_FUTURE_MS, 'future_realtime_request', 401);
  return Object.freeze({
    originalTransactionId: payload.originalTransactionId,
    sourceProductId: payload.productId,
    requestIdentifier: payload.requestIdentifier,
    userLocale: payload.userLocale,
    environment: payload.environment,
    appAppleId: payload.appAppleId,
    signedDate,
  });
}

/**
 * Evaluate verified native transaction/renewal claims, not client state hints.
 * Bad identity binding throws 401. Ordinary ineligibility returns a reason.
 * Callers must additionally bind the returned original/product IDs to the
 * verified realtime request or authenticated app claim that initiated lookup.
 */
export function evaluateNativeEligibility(transaction, renewal, config, now = Date.now(), options = {}) {
  validClock(now);
  const base = { eligible: false, originalTransactionId: null, sourceProductId: null };
  const no = reason => ({ ...base, reason });
  const campaign = config.campaign;
  if (!campaign.enabled) return no('campaign_disabled');
  if (now < campaign.startsAt) return no('campaign_not_started');
  if (now >= campaign.endsAt) return no('campaign_ended');

  assert(record(transaction) && record(renewal), 'invalid_native_claims', 401);
  assert(transaction.bundleId === config.bundleId, 'bundle_identity_mismatch', 401);
  assert(transaction.environment === config.environment && renewal.environment === config.environment,
    'native_environment_mismatch', 401);
  if (renewal.bundleId !== undefined) {
    assert(renewal.bundleId === config.bundleId, 'renewal_bundle_identity_mismatch', 401);
  }
  assert(typeof transaction.originalTransactionId === 'string'
    && TRANSACTION_ID.test(transaction.originalTransactionId), 'invalid_native_original_id', 401);
  assert(renewal.originalTransactionId === transaction.originalTransactionId, 'native_lineage_mismatch', 401);
  assert(PRODUCTS.has(transaction.productId)
    && campaign.sourceProductIds.includes(transaction.productId), 'native_source_product_mismatch', 401);
  assert(renewal.productId === transaction.productId, 'native_product_mismatch', 401);
  base.originalTransactionId = transaction.originalTransactionId;
  base.sourceProductId = transaction.productId;

  if (transaction.type !== 'Auto-Renewable Subscription') return no('not_auto_renewable');
  if (transaction.inAppOwnershipType !== 'PURCHASED') return no('not_purchased');
  if (transaction.isUpgraded === true) return no('upgraded_transaction');
  if (transaction.revocationDate != null || transaction.revocationReason != null) return no('revoked');
  if (!Number.isSafeInteger(transaction.expiresDate) || transaction.expiresDate <= now) return no('expired_or_invalid_term');
  if (renewal.isInBillingRetryPeriod !== undefined && typeof renewal.isInBillingRetryPeriod !== 'boolean') {
    return no('invalid_billing_state');
  }
  if (renewal.isInBillingRetryPeriod === true) return no('billing_retry');
  if (renewal.gracePeriodExpiresDate !== undefined && renewal.gracePeriodExpiresDate !== null) {
    if (!Number.isSafeInteger(renewal.gracePeriodExpiresDate) || renewal.gracePeriodExpiresDate <= 0) {
      return no('invalid_grace_period');
    }
    if (renewal.gracePeriodExpiresDate > now) return no('grace_period');
  }
  if (options.cancellationFlow === true) {
    if (![0, 1].includes(renewal.autoRenewStatus)) return no('renewal_unknown');
  } else if (renewal.autoRenewStatus !== 0) return no('renewal_enabled_or_unknown');
  if (renewal.expirationIntent !== undefined && renewal.expirationIntent !== 1) return no('not_voluntary_cancellation');
  const renewalSignedDate = signedTime(renewal.signedDate, 'invalid_renewal_signed_date', 401);
  if (renewalSignedDate < now - MAX_AGE_MS) return no('stale_renewal');
  if (renewalSignedDate > now + MAX_FUTURE_MS) return no('future_renewal');
  if (!campaign.storefronts.includes(transaction.storefront)) return no('unsupported_storefront');
  if (renewal.autoRenewProductId !== undefined && renewal.autoRenewProductId !== transaction.productId) {
    return no('plan_change_pending');
  }
  if (transaction.offerIdentifier === campaign.offerIdentifier || renewal.offerIdentifier === campaign.offerIdentifier) {
    return no('campaign_already_redeemed');
  }
  for (const offerType of [transaction.offerType, renewal.offerType]) {
    if (offerType !== undefined && (!Number.isSafeInteger(offerType) || offerType < 1 || offerType > 5)) {
      return no('unsupported_offer_type');
    }
  }
  if (DISCOUNT_OFFER_TYPES.has(transaction.offerType) || DISCOUNT_OFFER_TYPES.has(renewal.offerType)) {
    return no('discount_already_active_or_scheduled');
  }
  return { ...base, eligible: true, reason: 'eligible' };
}
