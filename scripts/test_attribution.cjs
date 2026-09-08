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

// A paid visitor can explore header anchors and multiple feature pages without
// losing attribution. Neither external URLs nor unrelated query data is copied.
function followPage(pathname, query, internalHref) {
  const appLink = {
    href: "https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&mt=8",
    dataset: {},
    addEventListener() {},
  };
  const internal = { href: internalHref };
  const external = { href: "https://example.com/guide/" };
  const mail = { href: "mailto:support@duetcalendar.com" };
  const location = new URL("https://duetcalendar.com" + pathname + query);
  const slug = pathname.split("/").filter(Boolean).pop() || "home";
  vm.runInNewContext(source, {
    URL,
    URLSearchParams,
    document: {
      querySelectorAll(selector) {
        return selector === ".js-app-store-link"
          ? [appLink]
          : [appLink, internal, external, mail];
      },
      body: { dataset: { pageSlug: slug } },
    },
    window: { location },
  });
  assert.equal(external.href, "https://example.com/guide/");
  assert.equal(mail.href, "mailto:support@duetcalendar.com");
  return {
    internal: new URL(internal.href, location),
    app: new URL(appLink.href),
  };
}
for (const query of [
  "?gclid=test-click&email=private",
  "?utm_source=google&utm_campaign=duet_google_pmax_20260807&email=private",
  "?utm_campaign=duet_search_bridge_cta_2026_05&email=private",
]) {
  const home = followPage("/", query, "https://duetcalendar.com/#features");
  assert.equal(home.internal.hash, "#features");
  assert.equal(home.internal.searchParams.get("email"), null);
  const guide = followPage(
    "/",
    query,
    "https://duetcalendar.com/co-parenting-expenses/",
  );
  const next = followPage(
    "/co-parenting-expenses/",
    guide.internal.search,
    "https://duetcalendar.com/#guides",
  );
  assert.equal(
    next.app.searchParams.get("ct"),
    home.app.searchParams.get("ct"),
  );
  assert.equal(next.app.searchParams.get("ppid"), paid);
  assert.equal(next.internal.searchParams.get("email"), null);
  assert.equal(next.internal.hash, "#guides");
}
// Guard static routes too: every new in-article App Store CTA uses the same path.
for (const relative of [
  "index.html",
  "co-parenting-expenses/index.html",
  "parenting-schedule-swaps/index.html",
  "ai-family-calendar/index.html",
  "shared-family-calendar/index.html",
]) {
  const html = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  for (const match of html.matchAll(
    /<a\b[^>]*href="https:\/\/apps\.apple\.com[^>]*>/g,
  )) {
    assert.match(match[0], /class="[^"]*js-app-store-link/, relative);
    assert.match(match[0], /data-cta-location=/, relative);
    assert.match(match[0], /pt=96322844/, relative);
  }
}
console.log(
  "PASS: paid cross-page/header navigation and all product-page App Store anchors.",
);
