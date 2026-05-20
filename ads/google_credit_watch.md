# Google Credit Watch

Date: May 19, 2026
Status: Bridge site OK + tracking armed. Google Ads access verified; campaign enabled. Promotions shows a $500 credit in Processing (no $300 credit visible).

## Bridge Site

- Live URL: `https://kohlivarun5.github.io/duet-calendar/`
- GitHub Pages status: serving `200`
- App Store campaign token: `duet_calendar_site_20260516` (present in App Store link `ct=` param)
- App Store URL: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_calendar_site_20260516&mt=8`

## Google Ads Campaign

- Account: `662-478-4803 Duet Co-parent Calendar`
- Campaign name to use: `DUET_SEARCH_BRIDGE_CTA_2026_05`
- Objective: Website traffic
- Campaign type: Search
- Final URL: `https://kohlivarun5.github.io/duet-calendar/`
- Status (paused/enabled): Enabled (verified in Google Ads UI).
- Promotion / billing credit: Promotions page shows `Get $500.00 credit for spending $500.00 on Google Ads` with status `Processing` (“You've met the criteria for this credit. It should be applied to your account soon.”). No $300 credit is visible today.

## Tracking

Tracking config in `index.html`:

- `googleAdsId: "AW-18121635903"`
- `conversionSendTo: "AW-18121635903/QbyeCM6hl6McEL_wiMFD"`

If either value ever differs or is missing, treat tracking as not armed and block enabling spend.

## App Store Attribution

- Campaign token `duet_calendar_site_20260516` attributed downloads: Not verified today (no App Store Connect access in this run)

## Current Credit Requirements

- Verified live HTML contains `conversionSendTo: "AW-18121635903/QbyeCM6hl6McEL_wiMFD"`.
- Confirm the bridge Search campaign is enabled and ads are approved/serving from the live campaign list (not the stale draft tab).
- Get one real same-device conversion from the active campaign (do not self-click the live ad).
- Watch Promotions for the credit to move from `Processing` to applied/available (and watch Gmail for any related confirmation).
- Need App Store Connect access to verify attributed downloads for `duet_calendar_site_20260516`.
