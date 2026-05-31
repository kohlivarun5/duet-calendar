# Google Credit Watch

Date: May 31, 2026
Status: Bridge site OK (verified 2026-05-31 13:02Z) + tracking ARMED (local `index.html`). Google Ads UI not checked today; last known (2026-05-28) is all visible campaigns paused and Google reports **"None of your ads are running"**. `$300` promo code redeemed; status is **Redeemed: Complete further requirements**. Existing `$500` offer remains **Processing**.

## Bridge Site

- Live URL: `https://kohlivarun5.github.io/duet-calendar/`
- GitHub Pages status: serving `200`
- App Store campaign token: `duet_calendar_site_20260516` (present in App Store link `ct=` param)
- App Store URL: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_calendar_site_20260516&mt=8`
- Last verified (this run): `2026-05-31 13:02Z`

## Google Ads Campaign

- Account: `662-478-4803 Duet Co-parent Calendar`
- Campaign name to use: `DUET_SEARCH_BRIDGE_CTA_2026_05`
- Objective: Website traffic
- Campaign type: Search
- Final URL: `https://kohlivarun5.github.io/duet-calendar/`
- Status (paused/enabled): Not verified today (last known paused as of `2026-05-28`; Google Ads UI shows **"None of your ads are running"**).
- Promotion / billing credit: `$300.00 credit for future ad spend` redeemed **May 28, 2026**; status **Redeemed: Complete further requirements**; credits granted `--`; credit expiration says **Once earned, use your credit within 60 days**. Existing **“Get $500.00 credit for spending $500.00 on Google Ads”** offer remains **Processing**, redeemed **May 10, 2026**, complete requirements by **Jul 9, 2026**, credits granted `--`.
- Ad quality work (May 20): responsive search ad expanded with 6 additional headlines and 2 additional descriptions. Ad strength is now `Pending` while Google re-reviews the edited assets.
- Keyword work (May 20): added missing high-intent phrase/exact keywords for parenting schedule app, custody schedule app, co-parent app, and shared calendar for co-parents. Some new exact/low-volume terms are `Pending` or `Not eligible: Low search volume`.

## Tracking

Tracking config in `index.html`:

- `googleAdsId: "AW-18121635903"`
- `conversionSendTo: "AW-18121635903/QbyeCM6hl6McEL_wiMFD"`

If either value ever differs or is missing, treat tracking as not armed and block enabling spend.

## App Store Attribution

- Campaign token `duet_calendar_site_20260516` attributed downloads: Not verified today (no App Store Connect access in this run)

## Current Credit Requirements

- Tracking tag IDs verified in `index.html` and live HTML (see Bridge Site + Tracking sections).
- Google Ads status/credit state cannot be verified via the Google Ads API from this environment (developer token limited to test accounts); requires manual Google Ads UI check.
- Still need Google Ads UI confirmation for: (1) campaign `DUET_SEARCH_BRIDGE_CTA_2026_05` conversion action receiving same-device conversions, and (2) Promotions showing the **$300** credit as fully active/applied, not only redeemed.
- Latest external signal: Google Ads email provided the `$300` code; code was redeemed on `2026-05-28`.
