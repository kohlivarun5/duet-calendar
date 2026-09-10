# Duet Calendar website

Static marketing website and free custody-planning tools for [Duet Calendar](https://duetcalendar.com/), deployed with GitHub Pages. HTML content is available without JavaScript; JavaScript powers the calculator and App Store attribution.

## Local preview and checks

```sh
python3 -m http.server 8767 --bind 127.0.0.1
python3 scripts/validate_site.py
node scripts/test_attribution.cjs
node --check assets/js/site.js
node --check assets/js/custody-calculator.js
git diff --check
```

Open `http://127.0.0.1:8767/`. Google tags are disabled on localhost. There is no package installation or compilation step. The site validator checks all sitemap pages, local links and assets, canonical URLs, unique metadata, JSON-LD, image dimensions, and indexability. The attribution tests cover organic pages, dedicated schedule and holiday listings, paid campaigns, and the `/app` redirect.

## Editing and release

- Homepage and feature pages use `assets/css/marketing.css`. Planning guides and the privacy page use `styles.css`.
- Keep each page's visible content, description, social metadata, and structured data consistent. Add new public pages to `sitemap.xml` and link them from a relevant existing page.
- Update `lastmod` only for pages that actually changed. Keep `/app/` out of the sitemap and retain its `noindex` and attribution-preserving redirect.
- Organic homepage and feature-page CTAs open the default App Store listing. Existing paid campaigns, schedule guides, and holiday guides retain their custom product page destinations. Campaign tokens remain stable for comparison over time.
- Every PR runs validation. A push to `main` validates and deploys the repository root via `.github/workflows/deploy-pages.yml`.
- See [asset provenance and SEO notes](docs/website-refresh-20260908.md) for the 1.18 website refresh.

## Regional discovery

`/regions/` links to English guides at `/canada/`, `/uk/`, `/ireland/`,
`/australia/`, and `/new-zealand/`. The six pages use reciprocal `hreflang`,
self-canonicals and a regional-hub `x-default`. Keep those links consistent;
the validator rejects orphaned pages and mismatched regional alternates.

Regional pages describe upcoming distribution, because the app is currently
US-only. On each confirmed country launch, update its visible availability,
FAQ answer and JSON-LD answer together. Verify the public storefront and
subscription prices before changing the CTA or pricing language. Preserve the
existing US page, `/app` redirect and attribution tokens. Country pages use
the default App Store product page in their own storefront for organic visits.

The guides use actual occasions and local school-calendar review, not a claim
to provide every state/province/school public-holiday calendar. Official
holiday references are linked from each guide.
