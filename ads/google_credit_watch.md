# Google Credit Watch

Date: May 16, 2026
Status: Site ready; campaign draft staged; Google Ads click conversion handler configured.

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
- Starting status: Paused until tracking is verified

The Google Ads browser flow is open on the new campaign screen with Website traffic and Search selected. The bridge URL has been entered, but the campaign has not been published or enabled.

## Tracking

The bridge page already has CTA click hooks for Google Ads:

- `app_store_cta_click`
- `conversion`

Tracking is now armed with the Google Ads website conversion action:

- `googleAdsId: "AW-18121635903"`
- `conversionSendTo: "AW-18121635903/QbyeCM6hl6McEL_wiMFD"`

The conversion action is `Outbound click`, source `Website`, primary action, created April 26, 2026. The event snippet from Google Ads uses `value: 1.0` and `currency: "USD"`, which the bridge CTA handler now sends on App Store clicks.

Google Ads also shows the matching global Google tag snippet for `AW-18121635903`; the bridge page loads that tag before firing the click conversion.

Before enabling traffic, verify the live GitHub Pages URL with Google Tag Assistant or Google Ads diagnostics. Google Ads may continue to show the action as inactive until the first tagged click is received.

## Current Tooling Blockers

- Adspirer Google Ads is connected, but the account has exhausted the 15 free tool calls for this billing period. Quota resets on May 31, 2026.
- The direct Google Ads MCP path could not verify or create the campaign because the accessible customer/API configuration is blocked by Google Ads account permissions and test-account developer-token restrictions.
- Because of those blockers, live campaign creation and conversion action details must be verified in the Google Ads UI until the API path is available again.

## Daily Watch

Local automation `duet-google-credit-watch` is active and should review this setup daily until the Google Ads credit is available or applied.

Each run should check:

- Bridge site returns `200`
- App Store campaign token is still present
- Google Ads tracking values still match `AW-18121635903` and `AW-18121635903/QbyeCM6hl6McEL_wiMFD`
- Google Ads campaign points to `https://kohlivarun5.github.io/duet-calendar/`
- Campaign remains paused unless the user explicitly approves enabling it
- Google Ads promotion or billing page shows whether the `$300` credit is available, pending, applied, or spent

The automation must not publish ads, enable campaigns, increase budgets, apply promotions, or scale spend without action-time confirmation.
