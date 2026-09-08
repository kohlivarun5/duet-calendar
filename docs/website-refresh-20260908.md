# Duet 1.18 website refresh

## Product and asset sources

Release target: Duet 1.18. Copy presents shared expenses and offered-only parenting-day changes as current features.

App source: `kohlivarun5/zoey-calendar` main at `2ee60e4`, including the 1.18 description, release notes, screenshot manifest, and September 7 expense capture. Website assets are web-optimized copies of `docs/app_store_assets/screenshots/iphone-6.9-1.18-search-readable-jpeg/`. The manifest records the underlying 1.16, 1.17, and 1.18 native captures used in those current marketing designs. Sample family names and amounts are synthetic.

| Website asset | Source screenshot |
| --- | --- |
| calendar | 01-intelligent-shared-calendar.jpg |
| topics | 02-topics-tasks-and-files.jpg |
| expenses | 03-shared-expenses-clear.jpg |
| smart-proposals | 04-ai-drafts-your-parenting-schedule.jpg |
| swap-requests | 05-review-changes-together.jpg |
| events | 06-events-and-holidays-clear.jpg |
| ai-import | 09-turn-messages-into-plans.jpg |

Each screenshot has 360px and 720px WebP variants at quality 83, with responsive source selection, explicit dimensions, and lazy loading below the hero. Their combined size is about 464 KB. The app icon comes from `docs/app_store_assets/creative/source/duet-app-icon-default.png`, exported at 96px, 32px, and 180px. The social card has an editable SVG source and a 1200×630 PNG for crawler compatibility.

## Search intent and conversion

| Page | Purpose |
| --- | --- |
| Homepage | Co-parenting calendar app and product overview |
| `/co-parenting-expenses/` | Expense splits, balances, external settlements, support tracking |
| `/parenting-schedule-swaps/` | Parenting-time exchanges and offered-only changes |
| `/ai-family-calendar/` | Reviewable event/task suggestions and Smart Proposals |
| `/shared-family-calendar/` | One-home and two-home family coordination |
| Existing custody guides/calculator | Preserve schedule-specific discovery and connect it to current features |

The implementation follows [Google's SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): useful page-specific content, crawlable links, unique descriptions, canonical URLs, descriptive image text, and a current sitemap. Structured data describes visible content. FAQ markup is not a promise of a rich result; no ratings, reviews, or ranking guarantees are invented. `llms.txt` is supplemental discovery context, not a ranking mechanism.

After release, use Search Console to assess indexing and search impressions/clicks for the four new feature paths and the existing schedule guides. App Store outbound clicks remain distinct from installs, sharing acceptance, and paid-family conversion. No campaign budgets or live advertising settings are changed by this website update.

## Validation

Run the commands in the README. Browser QA covers desktop and mobile homepage and feature layouts, native FAQ expansion, the calendar generator, App Store destinations, and no horizontal overflow. The site remains static; no client-rendering framework, web font download, or new runtime dependency is introduced.
