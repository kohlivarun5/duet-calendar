(function () {
  "use strict";
  var config = window.duetCalculatorAnalyticsConfig || {};
  var hosts = { US: "https://api2.amplitude.com/2/httpapi", EU: "https://api.eu.amplitude.com/2/httpapi" };
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var events = ["calculator_schedule_generated", "calculator_result_viewed", "calculator_pdf_exported", "app_store_clicked"];
  var allowedProperties = {
    experiment_id: ["calculator_shared_value_202609"],
    phase: ["control", "treatment"],
    copy_version: ["existing_result_v1", "shared_value_v1"],
    measurement_version: ["result_visibility_v1"],
    landing_page: ["custody-schedule-calculator"],
    traffic_source: ["organic_or_direct"],
    cta_location: ["calculator-topbar", "calculator-result", "calculator-bottom"],
    app_store_campaign_token: ["duet_web_calc_202609", "duet_calc_value_c_202609", "duet_calc_value_t_202609"],
    result_exposed: [true, false],
  };
  function permitted() {
    return config.enabled === true && config.reportingVerified === true &&
      /^\d+$/.test(config.projectId || "") && String(config.projectId) !== "811292" &&
      /^[a-f0-9]{32}$/i.test(config.apiKey || "") && Object.prototype.hasOwnProperty.call(hosts, config.region) &&
      ["duetcalendar.com", "www.duetcalendar.com"].includes(window.location.hostname) &&
      navigator.globalPrivacyControl !== true && navigator.doNotTrack !== "1" &&
      typeof window.fetch === "function";
  }
  function encode(event) {
    if (!event || !events.includes(event.name) || !uuid.test(event.sessionID) || !uuid.test(event.id) ||
        !Number.isSafeInteger(event.time) || !Number.isSafeInteger(event.sessionStartedAt) ||
        event.sessionStartedAt <= 0 || event.time < event.sessionStartedAt) throw new Error("Invalid event envelope");
    var properties = {};
    Object.keys(event.properties).forEach(function (key) {
      var value = event.properties[key];
      if (key === "release" && /^calculator_shared_value_[a-z0-9_]{1,40}$/.test(value)) {
        properties[key] = value;
      } else if (Object.prototype.hasOwnProperty.call(allowedProperties, key) && allowedProperties[key].includes(value)) {
        properties[key] = value;
      } else {
        throw new Error("Unsupported analytics property");
      }
    });
    return {
      event_type: event.name, device_id: event.sessionID, session_id: event.sessionStartedAt,
      time: event.time, insert_id: event.id, platform: "Web", event_properties: properties,
    };
  }
  window.duetWebAnalytics = {
    ready: permitted(),
    send: function (batch) {
      if (!permitted() || !Array.isArray(batch) || batch.length < 1 || batch.length > 2) return false;
      var payload = JSON.stringify({ api_key: config.apiKey, events: batch.map(encode) });
      return window.fetch(hosts[config.region], {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
        keepalive: true, credentials: "omit", referrerPolicy: "no-referrer",
      }).then(function (response) {
        if (!response.ok) throw new Error("Analytics unavailable");
        return response.json();
      }).then(function (receipt) {
        if (receipt.code !== 200 || receipt.events_ingested !== batch.length) throw new Error("Analytics not accepted");
        return true;
      });
    },
  };
})();
