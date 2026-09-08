// Exercise landing-page attribution independently of Google tags and the browser.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../assets/js/site.js"),
  "utf8",
);
const schedule = "87fdba48-108d-4ed2-8710-4772189f6bb2";
const holiday = "f5d8dd2d-228a-40c6-b74d-49815c1ca634";
const paid = "a4de00f6-f673-4e65-9ccd-a66aff48824a";
const cases = [
  ["home", "", "duet_web_home_202607", null],
  ["co-parenting-expenses", "", "duet_web_co_parenting_expenses_202607", null],
  [
    "shared-family-calendar",
    "",
    "duet_web_shared_family_calendar_202607",
    null,
  ],
  ["ai-family-calendar", "", "duet_web_ai_family_calendar_202607", null],
  [
    "parenting-schedule-swaps",
    "",
    "duet_web_parenting_schedule_swaps_202607",
    null,
  ],
  [
    "2-2-3-custody-schedule",
    "",
    "duet_web_2_2_3_custody_schedule_202607",
    schedule,
  ],
  [
    "holiday-custody-schedule",
    "",
    "duet_web_holiday_custody_schedule_202607",
    holiday,
  ],
  ["home", "?gclid=test", "duet_google_search_202607", paid],
  [
    "home",
    "?utm_source=google&utm_campaign=duet_google_pmax_20260807",
    "duet_google_pmax_20260807",
    paid,
  ],
  [
    "home",
    "?utm_source=google&utm_campaign=duet_search_bridge_cta_2026_05",
    "duet_search_bridge_cta_2026_05",
    paid,
  ],
  [
    "home",
    "?utm_campaign=duet_google_pmax_20260807",
    "duet_google_pmax_20260807",
    paid,
  ],
  [
    "home",
    "?utm_source=google&utm_campaign=unknown",
    "duet_google_search_202607",
    paid,
  ],
];
for (const [slug, query, campaign, ppid] of cases) {
  const link = {
    href: "https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&mt=8&ppid=old",
    dataset: {},
    addEventListener() {},
  };
  vm.runInNewContext(source, {
    URL,
    URLSearchParams,
    document: {
      querySelectorAll: () => [link],
      body: { dataset: { pageSlug: slug } },
    },
    window: { location: { search: query, pathname: "/" + slug + "/" } },
  });
  const url = new URL(link.href);
  assert.equal(url.hostname, "apps.apple.com");
  assert.equal(url.searchParams.get("ct"), campaign, slug + query);
  assert.equal(url.searchParams.get("ppid"), ppid, slug + query);
  assert.equal(url.searchParams.get("pt"), "96322844");
  assert.equal(url.searchParams.get("mt"), "8");
}
// /app continues to preserve only supported Apple attribution query parameters.
const redirect = fs.readFileSync(
  path.join(__dirname, "../app/index.html"),
  "utf8",
);
const code = [...redirect.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((x) => x[1])
  .join("\n");
let destination;
vm.runInNewContext(code, {
  URL,
  URLSearchParams,
  window: {
    location: {
      search: "?ct=test_campaign&ppid=test_page&email=drop-me",
      replace(url) {
        destination = url;
      },
    },
  },
  document: {
    getElementById() {
      return { href: "" };
    },
  },
});
const url = new URL(destination);
assert.equal(url.hostname, "apps.apple.com");
assert.equal(url.searchParams.get("ct"), "test_campaign");
assert.equal(url.searchParams.get("ppid"), "test_page");
assert.equal(url.searchParams.get("email"), null);
console.log(
  "PASS: 12 organic/paid landing scenarios and /app attribution filtering.",
);
