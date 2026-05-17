# Google Credit Watch

Date: May 17, 2026
Status: $300 Google Ads conversion setup completed; bridge site and Google tag verified in Google Ads setup.

## Bridge Site

- Live URL: `https://kohlivarun5.github.io/duet-calendar/`
- GitHub Pages status: serving `200`
- App Store campaign token: `duet_calendar_site_20260516`
- App Store URL: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_calendar_site_20260516&mt=8`

## Google Ads Campaign

- Account: `662-478-4803 Duet Co-parent Calendar`
- Campaign name to use: `DUET_SEARCH_BRIDGE_CTA_2026_05`
- Objective: Website traffic
- Campaign type: Search
- Final URL: `https://kohlivarun5.github.io/duet-calendar/`
- Status (paused/enabled): Needs next live UI/API verification. The stale draft screen returned `DRAFT_SYNCHRONOUS_PROMOTE_ERROR_INVALID_DRAFT_STATUS` when publish was retried, so use the live campaign overview/list rather than the old draft tab for the next check.
- Promotion / billing credit ($300): Offer setup opened from the $300 email, pointed to the bridge site, and completed with a new website conversion action. Credit still requires the first eligible same-device conversion from an active Search or Shopping campaign.

## Tracking

Tracking appears armed in `index.html`:

- `googleAdsId: "AW-18121635903"`
- `conversionSendTo: "AW-18121635903/ryb_CJ2c2a4cEL_wiMFD"`

If either value ever differs or is missing, treat tracking as not armed and block enabling spend.

## App Store Attribution

- Campaign token `duet_calendar_site_20260516` attributed downloads: Not verified today (no App Store Connect access in this run)

## Current Credit Requirements

- Confirm the bridge Search campaign is enabled and ads are approved/serving from the live campaign list, not the stale draft tab.
- Wait for the bridge Search campaign ad to be approved and active.
- Get one real same-device conversion from the active campaign. Do not self-click the live ad.
- After the first eligible conversion, watch Gmail for the $300 coupon-code email. Google says this can take up to 15 business days.
- Need App Store Connect access to verify attributed downloads for `duet_calendar_site_20260516`.
