# Google Credit Watch

Date: May 26, 2026
Status: Bridge site OK (verified 2026-05-26 13:01Z) + tracking ARMED (local `index.html`). Google Ads + App Store Connect not checked in this run (login required); last observed 2026-05-25: only a $500 offer visible and **Processing**; $300 credit not seen.

## Bridge Site

- Live URL: `https://kohlivarun5.github.io/duet-calendar/`
- GitHub Pages status: serving `200`
- App Store campaign token: `duet_calendar_site_20260516` (present in App Store link `ct=` param)
- App Store URL: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_calendar_site_20260516&mt=8`
- Last verified (this run): `2026-05-26 13:01Z`

## Google Ads Campaign

- Account: `662-478-4803 Duet Co-parent Calendar`
- Campaign name to use: `DUET_SEARCH_BRIDGE_CTA_2026_05`
- Objective: Website traffic
- Campaign type: Search
- Final URL: `https://kohlivarun5.github.io/duet-calendar/`
- Status (paused/enabled): Not verified today (no Google Ads access in this run).
- Promotion / billing credit: Not verified today (no Google Ads access in this run). Last observed 2026-05-25: Promotions page shows **“Get $500.00 credit for spending $500.00 on Google Ads”** with status **Processing** (“You've met the criteria for this credit. It should be applied to your account soon.”), redeemed **May 10, 2026**, complete requirements by **Jul 9, 2026**, credits granted `--`.
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
- Still need Google Ads UI confirmation for: (1) campaign `DUET_SEARCH_BRIDGE_CTA_2026_05` current state + conversion action receiving same-device conversions, and (2) Promotions showing the **$300** credit as available/applied (not visible today; $500 offer is Processing).
- Latest external signal: Google Ads email says code can take up to 15 business days after completing setup + first conversion (email received `2026-05-20`).
