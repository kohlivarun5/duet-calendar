const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/calculator-experiment.js"), "utf8");
let checks = 0;
function check(name, fn) { fn(); checks++; }
function setup(options = {}) {
  let now = 1791000000000;
  const events = [];
  const attempts = [];
  const timers = [];
  const storage = options.storage || new Map();
  const listeners = {};
  const offer = {};
  const copy = { hidden: true };
  const link = {
    dataset: { ctaLocation: "calculator-result" }, textContent: "Plan this in Duet",
    href: "https://apps.apple.com/app/apple-store/id6756833862?pt=96322844&mt=8&ct=duet_web_calc_202609&ppid=schedule",
  };
  let observer;
  const document = {
    visibilityState: "visible",
    querySelector(selector) {
      return selector === "[data-calculator-result-offer]" ? offer :
        selector === "[data-calculator-value-copy]" ? copy : link;
    },
    addEventListener(name, fn) { listeners[name] = fn; },
  };
  const window = {
    location: new URL("https://duetcalendar.com/custody-schedule-calculator/" + (options.query || "")),
    crypto: { randomUUID: crypto.randomUUID },
    duetCalculatorExperimentConfig: { enabled: true, phase: options.phase || "treatment", release: "calculator_shared_value_20261003", ...options.config },
    duetWebAnalytics: { ready: !options.unready, send(batch) {
      attempts.push(...JSON.parse(JSON.stringify(batch)));
      if (options.sinkThrows) throw new Error("blocked");
      if (batch[0].name === "calculator_result_viewed" && options.rejectExposures > 0) {
        options.rejectExposures--;
        return Promise.reject(new Error("temporary network failure"));
      }
      events.push(...JSON.parse(JSON.stringify(batch)));
      return true;
    } },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout(id) { timers[id - 1] = () => {}; },
    sessionStorage: {
      getItem(key) { if (options.storageThrows) throw new Error("blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (options.storageThrows) throw new Error("blocked"); storage.set(key, value); },
    },
    IntersectionObserver: function (fn) { observer = fn; this.observe = () => {}; },
  };
  if (options.local) window.location = new URL("http://localhost:8767/");
  vm.runInNewContext(source, {
    window, document, navigator: { userAgent: "ordinary-browser", ...options.navigator },
    URL, URLSearchParams, Date: { now: () => now },
  });
  return { events, attempts, timers, storage, link, copy, window, api: window.duetCalculatorExperiment,
    runNextTimer() { timers.shift()(); },
    visible(value = true) { observer([{ target: offer, isIntersecting: value, intersectionRatio: value ? 0.5 : 0 }]); },
    hidden(value) { document.visibilityState = value ? "hidden" : "visible"; listeners.visibilitychange(); },
    advance(ms) { now += ms; },
  };
}

check("automatic preview and visibility alone do not enter denominator", () => {
  const t = setup(); t.visible(); assert.equal(t.events.length, 0);
  t.api.appStoreClicked(t.link);
  assert.equal(t.events[0].properties.result_exposed, false);
  assert.equal(new URL(t.link.href).searchParams.get("ct"), "duet_web_calc_202609");
});
check("manual submission must also become visible", () => {
  const t = setup(); t.api.generated();
  assert.equal(t.events.filter(e => e.name === "calculator_result_viewed").length, 0);
  t.visible();
  assert.equal(t.events.filter(e => e.name === "calculator_result_viewed").length, 1);
});
check("hidden browser tabs cannot produce exposure", () => {
  const t = setup(); t.hidden(true); t.api.generated(); t.visible();
  assert.equal(t.events.length, 1); t.hidden(false);
  assert.equal(t.events.length, 2);
});
check("repeated generation and visibility dedupe exposure", () => {
  const t = setup(); t.visible(); t.api.generated(); t.api.generated(); t.visible(false); t.visible();
  assert.equal(t.events.filter(e => e.name === "calculator_result_viewed").length, 1);
});
check("click resends original exposure id and time for transport dedupe", () => {
  const t = setup(); t.api.generated(); t.visible(); const exposed = t.events[1];
  t.advance(5000); t.api.appStoreClicked(t.link);
  assert.deepEqual(t.events[2], exposed);
  assert.equal(t.events[3].properties.result_exposed, true);
  const target = new URL(t.link.href);
  assert.equal(target.searchParams.get("ct"), "duet_calc_value_t_202609");
  assert.equal(target.searchParams.get("pt"), "96322844");
  assert.equal(target.searchParams.get("ppid"), "schedule");
});
check("reload preserves qualified session without a second denominator event", () => {
  const a = setup(); a.api.generated(); a.visible();
  const b = setup({ storage: a.storage }); b.visible(); b.api.generated();
  assert.equal(b.events.filter(e => e.name === "calculator_result_viewed").length, 0);
  b.api.appStoreClicked(b.link);
  assert.equal(b.events[1].id, a.events[1].id);
  assert.equal(b.events[2].sessionID, a.events[1].sessionID);
});
check("30 minute idle expiry requires new manual qualification", () => {
  const t = setup(); t.visible(); t.api.generated(); t.api.appStoreClicked(t.link);
  const oldSession = t.events[0].sessionID;
  t.advance(30 * 60 * 1000); t.api.appStoreClicked(t.link);
  const click = t.events.at(-1);
  assert.notEqual(click.sessionID, oldSession);
  assert.equal(click.properties.result_exposed, false);
  assert.equal(new URL(t.link.href).searchParams.get("ct"), "duet_web_calc_202609");
  t.api.generated(); assert.equal(t.events.at(-1).name, "calculator_result_viewed");
});
check("control and treatment stay separate", () => {
  const c = setup({ phase: "control" }); assert.equal(c.copy.hidden, true);
  c.visible(); c.api.generated(); c.api.appStoreClicked(c.link);
  assert.equal(new URL(c.link.href).searchParams.get("ct"), "duet_calc_value_c_202609");
  const t = setup({ storage: c.storage }); assert.equal(t.copy.hidden, false);
  t.visible(); t.api.generated();
  assert.equal(t.events.at(-1).properties.phase, "treatment");
  assert.notEqual(t.events.at(-1).id, c.events[1].id);
});
for (const query of ["?gclid=x", "?gbraid=x", "?wbraid=x", "?msclkid=x", "?fbclid=x", "?utm_source=google", "?utm_medium=paid_social", "?utm_campaign=duet_google_pmax_20260807", "?utm_campaign=duet_search_bridge_cta_2026_05", "?duet_qa=1"]) {
  check("excludes " + query, () => assert.equal(setup({ query }).api, undefined));
}
for (const options of [{ config: { enabled: false } }, { config: { release: "calculator-shared-value" } },
  { config: { release: "calculator_shared_value_UPPER" } }, { unready: true }, { storageThrows: true }, { local: true },
  { navigator: { webdriver: true } }, { navigator: { userAgent: "ExampleBot" } },
  { navigator: { globalPrivacyControl: true } }, { navigator: { doNotTrack: "1" } }]) {
  check("fails closed " + JSON.stringify(options), () => assert.equal(setup(options).api, undefined));
}
check("failed measurement does not block actions", () => {
  const t = setup({ sinkThrows: true }); t.visible(); t.api.generated();
  assert.doesNotThrow(() => t.api.appStoreClicked(t.link));
});
check("other CTA locations preserve their original destination", () => {
  const t = setup(); t.visible(); t.api.generated();
  for (const location of ["calculator-topbar", "calculator-bottom"]) {
    const link = { href: t.link.href, dataset: { ctaLocation: location } };
    t.api.appStoreClicked(link);
    assert.equal(new URL(link.href).searchParams.get("ct"), "duet_web_calc_202609");
  }
});
check("event schema excludes family inputs, URLs and persistent identity", () => {
  const t = setup({ query: "?parentA=PrivateName&childName=PrivateChild&start=2026-10-03&time=PrivateTime" });
  t.visible(); t.api.generated(); t.api.pdfExported(); t.api.appStoreClicked(t.link);
  const json = JSON.stringify(t.events);
  for (const forbidden of ["PrivateName", "PrivateChild", "PrivateTime", "2026-10-03", "http", "referrer", "schedule_type"]) assert.ok(!json.includes(forbidden));
  for (const event of t.events) assert.deepEqual(Object.keys(event).sort(), ["id", "name", "properties", "sessionID", "sessionStartedAt", "time"].sort());
});
console.log(`PASS: ${checks} calculator exposure, session, exclusion, navigation and privacy checks.`);

(async () => {
  const t = setup({ rejectExposures: 2 }); t.visible(); t.api.generated();
  await Promise.resolve(); t.runNextTimer(); await Promise.resolve(); t.runNextTimer();
  const attempts = t.attempts.filter(e => e.name === "calculator_result_viewed");
  assert.equal(attempts.length, 3);
  assert.equal(new Set(attempts.map(e => e.id)).size, 1);
  assert.equal(new Set(attempts.map(e => e.time)).size, 1);
  assert.equal(t.events.filter(e => e.name === "calculator_result_viewed").length, 1);
  assert.equal(t.events.filter(e => e.name === "app_store_clicked").length, 0);
  assert.equal(Object.values(JSON.parse([...t.storage.values()][0]).phases)[0].acknowledged, true);
  const dropped = setup({ rejectExposures: 1 }); dropped.visible(); dropped.api.generated();
  await Promise.resolve();
  const reloaded = setup({ storage: dropped.storage });
  assert.equal(reloaded.events[0].name, "calculator_result_viewed");
  assert.equal(reloaded.events[0].id, dropped.attempts.find(e => e.name === "calculator_result_viewed").id);
  console.log("PASS: failed exposure retries without a click, preserves identity/time, and recovers after reload.");
})().catch(error => { console.error(error); process.exitCode = 1; });
