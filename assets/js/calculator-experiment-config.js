// Set a verified web-only analytics destination before enabling a phase.
// Keep control for seven complete UTC days, then publish treatment separately.
window.duetCalculatorAnalyticsConfig = {
  enabled: false,
  reportingVerified: false,
  projectId: "",
  apiKey: "", // Public ingestion key only. Never put a secret/export key here.
  region: "US",
};
window.duetCalculatorExperimentConfig = {
  enabled: false,
  phase: "control",
  release: "calculator_shared_value_20261003",
};
