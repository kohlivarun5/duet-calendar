# Calculator campaign token correction

Prepared September 24, 2026 from website main `770a14374761a77445117d457f60acfa7fb47822`. Deployment is pending; this document does not establish a live cutover.

The calculator's generated non-paid campaign token is `duet_web_custody_schedule_calculator_202607` (43 characters). Apple's current campaign-link documentation specifies a maximum of 30 characters. This change gives the calculator an explicit 20-character token, `duet_web_calc_202609`. It does not establish that historical campaign data was rejected. [Apple campaign-link documentation](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links).

## Scope

All three App Store links on `/custody-schedule-calculator/` intentionally use the corrected token for traffic that falls back to the existing non-paid route: `calculator-topbar`, `calculator-result` and `calculator-bottom`. The page has always used one campaign series; `cta_location` still distinguishes its controls in click events.

The shared resolved token drives both each destination's `ct` and the existing `app_store_clicked` payload's `campaign_token` and `app_store_campaign_token`. Provider token `96322844`, media type `8`, app ID `6756833862`, and schedule custom product page `87fdba48-108d-4ed2-8710-4772189f6bb2` stay the same. Recognized paid campaigns and Google click identifiers retain their current routing. Every other page's tokens remain unchanged.

The calculator's script cache key changes to `20260924`. No visible copy, layout, paid campaign, analytics destination, arbitrary UTM handling, or invitation/purchase flow changes.

## Reporting cutover

The corrected token starts a **new series** when this change is deployed. Keep the old token's historical records under their original name; do not silently relabel them or interpret a new row as acquisition lift. At deployment, record the actual UTC time and deployed commit, then confirm the three live links resolve to the new token. Historical and new series can be presented as separate dated periods; do not assume an equivalent baseline or that unavailable campaign data is zero.

| Field | Value |
| --- | --- |
| Previous token | `duet_web_custody_schedule_calculator_202607` |
| New token | `duet_web_calc_202609` |
| Actual deployed commit | Pending |
| Actual UTC cutover | Pending |
| Live route readback | Pending |
| Apple report readback | Pending |

This is attribution maintenance, not a live marketing experiment. Read access to a usable website event/session reporting source has not been established. Adding or emitting `gtag` events does not itself prove that a reportable denominator exists. No new analytics service is introduced.

## Validation

- `python3 scripts/validate_site.py`: passed for all 23 indexed pages, metadata, structured data, sitemap, local links/assets and `/app` noindex.
- `node scripts/test_attribution.cjs`: passed 26 organic/paid landing scenarios, 24 calculator CTA payload/fallback-navigation cases, existing `/app` filtering, paid cross-page links and regional routing.
- `node --check assets/js/site.js`, `node --check assets/js/custody-calculator.js`, `git diff --check`: passed.
- Local Chrome readback: the topbar, result and bottom calculator links all used `duet_web_calc_202609`; the same three links with `utm_source=google&utm_campaign=duet_google_pmax_20260807` retained `duet_google_pmax_20260807`. Both retained the existing provider/media/product page values. Localhost disables Google tags; no live analytics events or App Store visits were produced.

No production deployment, merge, purchase or outbound marketing action was performed.
