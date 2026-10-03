(function () {
  "use strict";
  var config = window.duetCalculatorExperimentConfig || {};
  var sink = window.duetWebAnalytics;
  var result = document.querySelector("[data-calculator-result-offer]");
  var copy = document.querySelector("[data-calculator-value-copy]");
  var resultLink = document.querySelector('[data-cta-location="calculator-result"]');
  var originalResultDestination;
  var phase = config.phase;
  var experiment = "calculator_shared_value_202609";
  var storageKey = "duet.calculator.pilot.session.v1";
  var idleLimit = 30 * 60 * 1000;
  var query = new URLSearchParams(window.location.search);
  var paid = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"].some(function (key) {
    return query.has(key);
  }) || query.get("utm_source") === "google" ||
    /^(cpc|ppc|paid|paid_social|paid_search|display)$/i.test(query.get("utm_medium") || "") ||
    ["duet_google_pmax_20260807", "duet_search_bridge_cta_2026_05"].includes(query.get("utm_campaign"));
  var excluded = paid || query.has("duet_qa") || navigator.webdriver ||
    navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" ||
    /bot|crawler|spider|headless/i.test(navigator.userAgent || "") ||
    !["duetcalendar.com", "www.duetcalendar.com"].includes(window.location.hostname);

  // An Ads tag alone is not a reportable session source. Fail closed until the
  // dedicated adapter and its read access are verified and explicitly enabled.
  if (!config.enabled || !["control", "treatment"].includes(phase) ||
      !config.release || !sink || sink.ready !== true || typeof sink.send !== "function" ||
      !result || !copy || !resultLink || excluded || !window.IntersectionObserver ||
      !window.crypto || typeof window.crypto.randomUUID !== "function") return;

  var session;
  try {
    session = JSON.parse(window.sessionStorage.getItem(storageKey));
    if (!session || typeof session.id !== "string" || !Number.isFinite(session.lastActivity) ||
        Date.now() - session.lastActivity >= idleLimit || session.lastActivity > Date.now()) {
      session = { id: window.crypto.randomUUID(), startedAt: Date.now(), lastActivity: Date.now(), phases: {} };
    }
    if (!session.phases || typeof session.phases !== "object") session.phases = {};
    window.sessionStorage.setItem(storageKey, JSON.stringify(session));
  } catch (error) {
    // Without stable session storage, reloads would inflate the denominator.
    return;
  }

  var manualResult = false;
  var visible = false;
  var phaseKey = experiment + ":" + phase + ":" + config.release;
  var copyVersion = phase === "treatment" ? "shared_value_v1" : "existing_result_v1";
  var token = phase === "treatment" ? "duet_calc_value_t_202609" : "duet_calc_value_c_202609";

  copy.hidden = phase !== "treatment";
  resultLink.textContent = phase === "treatment" ? "Start free in Duet" : "Plan this in Duet";

  function persist() {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(session));
      return true;
    } catch (error) { return false; }
  }

  function touch() {
    if (Date.now() - session.lastActivity >= idleLimit) {
      session = { id: window.crypto.randomUUID(), startedAt: Date.now(), lastActivity: Date.now(), phases: {} };
      manualResult = false;
    }
    session.lastActivity = Date.now();
    return persist();
  }

  function record(name, fields, id, time) {
    return {
      name: name,
      sessionID: session.id,
      sessionStartedAt: session.startedAt,
      id: id || window.crypto.randomUUID(),
      time: time || Date.now(),
      properties: Object.assign({
        experiment_id: experiment,
        phase: phase,
        copy_version: copyVersion,
        measurement_version: "result_visibility_v1",
        release: config.release,
        landing_page: "custody-schedule-calculator",
        traffic_source: "organic_or_direct",
      }, fields || {}),
    };
  }

  function send(events) {
    try {
      // Adapters must accept only this bounded schema. They must never enrich
      // it with form values, URL/referrer strings, or persistent user identity.
      var pending = sink.send(events);
      if (pending && typeof pending.catch === "function") pending.catch(function () {});
    } catch (error) { /* Analytics must not block a calculator action. */ }
  }

  function exposure() {
    var saved = session.phases[phaseKey];
    return saved ? record("calculator_result_viewed", {}, saved.id, saved.time) : null;
  }

  function qualify() {
    if (!manualResult || !visible || document.visibilityState !== "visible") return;
    if (!touch() || !manualResult) return;
    if (!session.phases[phaseKey]) {
      session.phases[phaseKey] = { id: window.crypto.randomUUID(), time: Date.now() };
      if (!persist()) { delete session.phases[phaseKey]; return; }
      send([exposure()]);
    }
  }

  new window.IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.target === result) visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
    });
    qualify();
  }, { threshold: [0, 0.5] }).observe(result);
  document.addEventListener("visibilitychange", qualify);

  window.duetCalculatorExperiment = {
    generated: function () {
      if (!touch()) return;
      manualResult = true;
      send([record("calculator_schedule_generated")]);
      qualify();
    },
    pdfExported: function () {
      if (!touch()) return;
      send([record("calculator_pdf_exported", { result_exposed: !!exposure() })]);
    },
    appStoreClicked: function (link) {
      if (!touch()) return;
      qualify();
      var location = link.dataset.ctaLocation;
      if (!["calculator-topbar", "calculator-result", "calculator-bottom"].includes(location)) return;
      var viewed = exposure();
      var qualified = !!viewed;
      // site.js applies the existing channel attribution after this script loads.
      // Capture that destination on the first click, not during initialization.
      if (location === "calculator-result") {
        if (!originalResultDestination) originalResultDestination = link.href;
        link.href = originalResultDestination;
      }
      if (location === "calculator-result" && qualified) {
        var destination = new URL(link.href);
        destination.searchParams.set("ct", token);
        link.href = destination.toString();
      }
      var click = record("app_store_clicked", {
        cta_location: location,
        result_exposed: qualified,
        app_store_campaign_token: new URL(link.href).searchParams.get("ct"),
      });
      // Repeat the same exposure id with the click. The destination must dedupe
      // that id, so a dropped first request cannot create a numerator-only row.
      send(viewed ? [viewed, click] : [click]);
    },
  };
})();
