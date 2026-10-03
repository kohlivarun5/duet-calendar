const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/calculator-analytics.js"), "utf8");
const event = {
  name: "calculator_result_viewed", sessionID: "d505cb1c-af6a-4455-9287-36d99516b334",
  id: "c46a2a3c-c478-41de-a7d8-cf25a0e3d5d3", time: 1791000001000, sessionStartedAt: 1791000000000,
  properties: { experiment_id: "calculator_shared_value_202609", phase: "control",
    copy_version: "existing_result_v1", measurement_version: "result_visibility_v1",
    release: "calculator_shared_value_20261003", landing_page: "custody-schedule-calculator", traffic_source: "organic_or_direct" },
};
function setup(overrides = {}, options = {}) {
  const requests = [];
  const window = {
    location: { hostname: "duetcalendar.com" },
    duetCalculatorAnalyticsConfig: { enabled: true, reportingVerified: true, projectId: "123456", apiKey: "a".repeat(32), region: "US", ...overrides },
    fetch(url, request) {
      requests.push({ url, ...request });
      return Promise.resolve({ ok: !options.failure, json: () => Promise.resolve({ code: 200, events_ingested: JSON.parse(request.body).events.length }) });
    },
  };
  vm.runInNewContext(source, { window, navigator: options.navigator || {} });
  return { api: window.duetWebAnalytics, requests };
}
(async () => {
  for (const override of [{ enabled: false }, { reportingVerified: false }, { projectId: "811292" }, { apiKey: "" }, { region: "invalid" }]) {
    const t = setup(override); assert.equal(t.api.ready, false); assert.equal(t.api.send([event]), false); assert.equal(t.requests.length, 0);
  }
  const t = setup(); assert.equal(t.api.ready, true); assert.equal(await t.api.send([event]), true);
  const request = t.requests[0]; const payload = JSON.parse(request.body);
  assert.equal(request.url, "https://api2.amplitude.com/2/httpapi");
  assert.equal(request.keepalive, true); assert.equal(request.credentials, "omit"); assert.equal(request.referrerPolicy, "no-referrer");
  assert.deepEqual(Object.keys(payload.events[0]).sort(), ["device_id", "event_properties", "event_type", "insert_id", "platform", "session_id", "time"].sort());
  assert.equal(payload.events[0].device_id, event.sessionID);
  assert.equal(payload.events[0].insert_id, event.id);
  for (const properties of [{ ...event.properties, child_name: "private" }, { ...event.properties, phase: "private" }, { ...event.properties, release: "name@example.com" }]) {
    assert.throws(() => t.api.send([{ ...event, properties }]));
  }
  assert.throws(() => t.api.send([{ ...event, sessionID: "personal-identifier" }]));
  assert.throws(() => t.api.send([{ ...event, name: "$identify" }]));
  assert.equal(t.requests.length, 1);
  const eu = setup({ region: "EU" }); await eu.api.send([event]); assert.equal(eu.requests[0].url, "https://api.eu.amplitude.com/2/httpapi");
  await assert.rejects(setup({}, { failure: true }).api.send([event]));
  assert.equal(setup({}, { navigator: { globalPrivacyControl: true } }).api.ready, false);
  console.log("PASS: analytics destination, app-project rejection, privacy allowlist, session envelope and failure behavior.");
})().catch(error => { console.error(error); process.exitCode = 1; });
