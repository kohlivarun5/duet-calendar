# Duet retention API

Cloudflare Worker for `api.duetcalendar.com`, maintained in the same repository as the static Duet website. The website continues to deploy through GitHub Pages. `scripts/stage_pages.py` excludes this entire directory, dependencies, local secrets, and internal scripts from the Pages artifact.

## Routes and trust

| Method/path | Caller and behavior |
| --- | --- |
| `GET /health` | Returns environment and whether the campaign window is enabled. This is liveness, not confirmation of Apple credentials/approval. |
| `POST /v1/apple/retention` | Apple-signed `{ signedPayload }`; verifies app/environment/request freshness, gets current signed subscription status from Apple, applies eligibility, then returns an approved text message or the signed monthly promotional offer. |
| `POST /v1/offers/retention` | Native app sends `{ signedTransactionInfo, signedRenewalInfo }`. Both are verified and bound before a fresh Apple status lookup. Only canceled, active, purchased Shared terms in the configured storefront qualify. |
| `POST /v1/apple/subscription-notifications` | Apple Server Notifications V2 `{ signedPayload }`; verifies scope and linked transaction/renewal proofs. Records a campaign offer that is redeemed or scheduled for the next renewal. |

The native response includes `productId`, `offerIdentifier`, `campaignId`, and `promotionalOfferSignatureV2`. The app must read localized offer and renewal terms from StoreKit and reconcile verified transactions; this API does not itself perform a purchase. It never accepts client-selected product IDs, discount IDs, subscription IDs, or prices.

For annual-to-monthly cancellation offers, sign the **monthly** target product with the verified current **original transaction ID**. Return only `promotionalOffer`, not a simultaneous `alternateProduct`. Apple owns the final charge/switch UI. Remaining-trial treatment and billing dates still require sandbox verification before activation.

## Local checks

Use Node 24 or later:

```sh
cd workers/retention-api
npm ci
npm run check
npm test
npm run build
npm run test:runtime
npm run dev
# In another terminal:
curl http://127.0.0.1:8787/health
```

`npm run build` bundles with Wrangler but does not deploy. `npm run test:runtime` boots that bundle in real workerd, verifies request rejection and actual ES256 signing with ephemeral test keys, and checks Durable Object redemption behavior with outbound HTTP blocked. Apple's SDK must be lazily imported inside a request because one dependency initializes randomness, which Workers disallows at global scope.

Apple's official Node library is pinned to 3.1.0. The bundled Apple Root CA G3 is public certificate material from [Apple Certificate Authority](https://www.apple.com/certificateauthority/). Offline certificate-chain verification is used with strict timestamp freshness to avoid OCSP network delays on the real-time path. This omits live OCSP revocation checks; review that tradeoff when updating verification policy. Never enable the SDK's Xcode/LocalTesting environments in a deployed service.

## Cloudflare deployment

Wrangler's `sandbox` and `production` environments have separate Worker names and Durable Object storage. Both ship with the campaign **disabled**. Sandbox initially uses a `workers.dev` URL; production uses the custom domain `api.duetcalendar.com`. The domain's Cloudflare zone/account must be accessible.

```sh
npx wrangler login
npx wrangler whoami
npm run deploy:sandbox
# Only after sandbox checks and account/domain readback:
npm run deploy:production
```

Manual CI is available through **Deploy retention API**. Set `CLOUDFLARE_ACCOUNT_ID` and a narrowly scoped `CLOUDFLARE_API_TOKEN` in repository or `retention-api-sandbox` / `retention-api-production` environment secrets. Grant only the account/zone permissions Wrangler needs for this Worker, Durable Objects, and the selected custom domain. Do not commit the token or put it in public website JavaScript.

Set these Worker secrets separately for each environment:

```sh
npx wrangler secret put IAP_PRIVATE_KEY --env sandbox
npx wrangler secret put IAP_KEY_ID --env sandbox
npx wrangler secret put IAP_ISSUER_ID --env sandbox
npx wrangler secret put SUBSCRIBER_HASH_SECRET --env sandbox
```

Repeat with `--env production` for production. `IAP_PRIVATE_KEY` must be an **In-App Purchase** private key, not the general App Store Connect API key. `SUBSCRIBER_HASH_SECRET` is at least 32 random characters. Keep that secret and the campaign identity stable: changing them without migrating state resets redemption lookups. Secrets belong only in Cloudflare secrets or ignored local `.dev.vars`; do not put real secrets in configuration JSON or documentation. Observability body logging is disabled, and the service never logs payloads, signatures, IDs, or raw SDK errors.

## Apple configuration and activation

1. Obtain Apple's real-time Retention Messaging access. Create an approved promotional offer on `com.vkohli.zoeycalendar.shared.monthly`: US $1.99 for **one month**, followed by the applicable regular monthly price. Keep source/target products in their established subscription group/service level. Do not use an introductory offer as a substitute for prior trial users.
2. Configure text-only messages in sandbox and production. The same approved value text can be a safe fallback; the native Apple offer UI supplies price/term disclosures. `messages/en-US.json` is draft copy, not an approved message.
3. Configure the Worker secrets and the reviewed fields from `campaign.example.json` in the relevant `RETENTION_CAMPAIGN_JSON` Wrangler variable. Replace every placeholder, use a real lower-case message UUID and offer identifier, and set bounded dates. Keep production `enabled: false` until the checks below pass. The source configuration intentionally does not enable a live commercial campaign.
4. Register the sandbox callback and default messages using the operator CLI below. Configure Server Notifications V2 to the matching environment's `/v1/apple/subscription-notifications` URL in App Store Connect so scheduled/actual redemptions reach the ledger. Confirm receipt with Apple's notification test flow, then enable and deploy only the reviewed sandbox campaign for the following tests. Keep production disabled.
5. Test a canceled active annual introductory trial with zero paid terms; verify the real $1.99 month, correct regular monthly renewal, no unintended new introductory trial, and the exact first charge date. Repeat for current monthly and preserved-price purchasers. Test declined/abandoned/deferred offers, repeat attempts, cross-device state and wrong storefronts. A configured offer's actual price is controlled by Apple, not the campaign's descriptive ID.
6. Pass Apple's sandbox performance test, including cold and warm Worker paths. Only then configure the production endpoint and enable the reviewed production campaign. Read back URL/configuration and verify its native UI before calling the cancellation flow live.

The US storefront is established from Apple's signed transaction, not inferred from locale. Real-time signing requires both a supported message locale and current-state proof. The 150ms request-verification and 450ms lookup/signing budgets leave margin within Apple's 700ms deadline; expired/unavailable status, slow upstream responses, or signing/storage failures return a safe approved message after a valid request. Missing locale/campaign configuration or an unverified request returns non-200 so Apple uses its separately configured defaults. Actual hosted performance remains a production prerequisite.

## Operator CLI

Use local environment variables `IAP_KEY_ID`, `IAP_ISSUER_ID`, and `IAP_PRIVATE_KEY_PATH` pointing to the protected key file. Do not paste keys into command arguments. All mutations require `--yes`; nothing automatically registers a production endpoint.

```sh
node scripts/apple-retention.mjs status --environment Sandbox
node scripts/apple-retention.mjs upload-message --environment Sandbox --message-id <lowercase-uuid> --file messages/en-US.json --yes
node scripts/apple-retention.mjs set-defaults --environment Sandbox --message-id <approved-uuid> --yes
node scripts/apple-retention.mjs set-url --environment Sandbox --url https://<sandbox-worker>.workers.dev/v1/apple/retention --yes
node scripts/apple-retention.mjs performance-test --environment Sandbox --transaction-id <sandbox-original-id> --yes
node scripts/apple-retention.mjs performance-result --environment Sandbox --request-id <request-id>
```

Do not record real transaction IDs in documentation or CI logs. The command output contains only configuration/performance information; errors omit Apple's raw response bodies. Production `set-url` accepts only the expected `api.duetcalendar.com/v1/apple/retention` destination.

## Redemption and abuse boundaries

The Durable Object ledger is addressed with an HMAC of environment plus subscription lineage. It persists confirmed/scheduled campaign redemption markers and a per-lineage rate counter, not raw IDs, signed proofs, private keys, or signed offer tokens. Short-lived retry signatures exist only in memory. Simply showing an offer does not mark it redeemed.

Markers enforce **observed redemption per lineage and campaign**, not a lifetime once-per-Apple-customer policy. Notifications can be delayed; a resubscription may create another lineage. Do not claim global once-only enforcement. Current signed transaction/renewal checks also suppress active or queued discounts. Keep the notification integration enabled and use Apple offer eligibility controls when available; validate cross-surface behavior before enabling separate offer-code and retention campaigns.

The per-lineage rate limit is applied only after signature verification. Configure Cloudflare edge rate limiting on the public routes before commercial activation; this protects verification work from unauthenticated request floods. Requests have strict method/content-type/field/streamed-size bounds and no browser CORS grant. The app's signed purchase proofs are bearer authorization evidence; there is no hardcoded app-wide client secret.

## Scope

This repository change supplies the backend. iOS offer presentation/purchase integration and the opt-in local reminder **48 hours before trial expiry** remain in the iOS implementation plan [zoey-calendar #334](https://github.com/kohlivarun5/zoey-calendar/pull/334). Local reminder delivery still depends on observing cancellation on-device; adding this API does not automatically implement push notifications or change family data access.

References: [Apple retention endpoint](https://developer.apple.com/documentation/retentionmessaging/setting-up-retention-messaging-endpoint), [V2 promotional signature](https://developer.apple.com/documentation/retentionmessaging/promotionaloffersignaturev2), [message setup](https://developer.apple.com/documentation/retentionmessaging/setting-up-retention-messages), [Cloudflare custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
