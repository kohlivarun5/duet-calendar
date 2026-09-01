# App Store Connect Links

Date: May 16, 2026

Use these URLs for the Duet bridge setup:

- Marketing URL / bridge site: `https://duetcalendar.com/`
- Support URL: `https://duetcalendar.com/#support`
- App Store campaign link: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_calendar_site_20260516&mt=8`

The campaign token `duet_calendar_site_20260516` is used by both App Store CTA links on the bridge site so App Store Connect can attribute downloads from this landing page separately from the older Google direct campaign links.

## Performance Max attribution

Date: August 7, 2026

- PMax landing URL: `https://duetcalendar.com/?utm_source=google&utm_medium=pmax&utm_campaign=duet_google_pmax_20260807`
- App Store campaign link: `https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&ct=duet_google_pmax_20260807&mt=8&ppid=a4de00f6-f673-4e65-9ccd-a66aff48824a`
- App Store campaign token: `duet_google_pmax_20260807`

The site maps this PMax UTM campaign to its own App Store campaign token while keeping the shared-calendar custom product page.

## Search bridge attribution

Date: August 12, 2026

- Search landing URL: `https://duetcalendar.com/?utm_source=google&utm_medium=cpc&utm_campaign=duet_search_bridge_cta_2026_05`
- App Store campaign token after the landing-page click: `duet_search_bridge_cta_2026_05`

The site preserves recognized paid campaign tokens through the App Store CTA. Other Google-paid visits continue to use `duet_google_search_202607`, while unknown UTM values are not copied into App Store attribution.
