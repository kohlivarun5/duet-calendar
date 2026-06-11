# Google Credit Watch

Date: June 10, 2026
Status: Bridge site OK + tracking ARMED. Credit still needs Google Ads UI confirmation; Google Ads API reads are still blocked for this non-test account.

## Site Status

- URL: `https://kohlivarun5.github.io/duet-calendar/`
- HTTP: `200` (verified `2026-06-10`)
- App Store link present with token `duet_calendar_site_20260516`
- App Store URL: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_calendar_site_20260516&mt=8`

## Tracking Status

- `index.html` has `window.duetAdsConfig.googleAdsId = "AW-18121635903"`
- `index.html` has `window.duetAdsConfig.conversionSendTo = "AW-18121635903/QbyeCM6hl6McEL_wiMFD"`
- Armed: YES (if either value ever differs or is missing, treat tracking as NOT armed)

## Campaign Status (Google Ads)

- Account: `662-478-4803 Duet Co-parent Calendar`
- Campaign: `DUET_SEARCH_BRIDGE_CTA_2026_05` (Search / Website traffic)
- Final URL: `https://kohlivarun5.github.io/duet-calendar/`
- Status (paused/enabled): Not verified today. Google Ads connector can list customer `662-478-4803`, but data reads are blocked by the current developer token / login-customer path for this non-test account.

## Promotion / Credit Status

- `$300` promo code: Redeemed `2026-05-28`; Google Ads UI last known status: **Redeemed: Complete further requirements** (not verified today)
- Existing `$500` offer: **Processing** (not verified today)

## App Store Attribution

- Token `duet_calendar_site_20260516` attributed downloads: Not verified today (no App Store Connect access in this run)

## Blockers (Exact)

- Google Ads UI check needed for: campaign status + conversion action receiving events + Promotions/Billing showing `$300` credit as available/applied (not only redeemed).
- Automation is currently `INACTIVE`, so the daily watch will not continue unless re-enabled.
