# Calculator value copy and exposure measurement

Prepared October 3, 2026 from website main `508626a`. This PR is a disabled,
reviewable implementation. It has not published a treatment or established a
live denominator. The current connection exposes only the app's Amplitude
project (`811292`); a separate queryable web project is still required.

The result treatment explains ongoing coordination, free private planning,
Shared monthly/yearly sharing, and no second subscription for the invited
co-parent. It preserves the calculator, PDF, share action, import limitation,
existing product-page destination and all other App Store actions.

## Configure and verify

`assets/js/calculator-experiment-config.js` contains explicit disabled switches
for the analytics adapter and experiment. No key is committed. The optional
adapter uses Amplitude HTTP V2 with a **public ingestion key**, a separate web
project ID and the project's US/EU region. Never insert a secret/export key or
reuse the app project. The connector must be able to query that same web project.

Before enabling either phase, validate a clearly labeled synthetic probe in the
chosen web project and read it back with the connected query tools. Verify
timezone (UTC), event receipt, the event schema, repeated-insert deduplication,
and project ID/key association. A public key cannot be validated from its format.
Set `reportingVerified` only after this readback is saved. The local mocked
browser test is not that verification. The adapter refuses app project 811292;
this does not prove a mistakenly configured key belongs to the declared project.

Publish control first and record its actual commit and publication time. Collect
seven **complete UTC days**, then publish treatment through a separate reviewed
config change and collect another seven complete days. A deployment-day partial
window is excluded. `phase` does not switch automatically. Save concurrent
changes and use the original September 24 pilot's sample gates: at least 50
eligible sessions per phase, and a provisional treatment goal of 10 result
clicks and 20%, above the measured control rate. This small staged pilot cannot
establish causal lift. If timing extends past October 21, it is not evidence for
the existing October 23 goal deadline.

## Session and event contract

An eligible session has explicitly submitted Generate schedule and had at least
50% of the result value/action block in the viewport while the tab is visible.
The automatic preview is excluded. One exposure is recorded per session/phase/
release. Reloads and repeated generation retain its event ID and timestamp.

The random UUID is kept in **tab-scoped sessionStorage**, expires after 30
minutes without a relevant action, and is sent as Amplitude `device_id` with
the session start timestamp as `session_id`. It is not a persistent device or
person ID. Duplicate tabs may inherit a sessionStorage snapshot; treat this as
a browser-tab session approximation, not a count of people. If sessionStorage
is unavailable, the pilot stays off instead of inflating counts on every reload.

Exclude localhost, `duet_qa`, automated browsers/known bot strings, GPC/DNT,
Google paid identifiers/campaigns, recognized paid UTM media, and other click
identifiers (`msclkid`, `fbclid`). The latter exclusion is conservative: a click
identifier alone does not prove paid traffic. Bot detection is incomplete and
blocked analytics creates observation loss; never call these all website visits.

| Ingested name | Meaning |
| --- | --- |
| `calculator_schedule_generated` | Successful explicit form submission; repeats allowed |
| `calculator_result_viewed` | First eligible visible result in that session/phase/release |
| `calculator_pdf_exported` | Existing PDF generation reached its save call; not proof the file was retained |
| `app_store_clicked` | Any of the three existing calculator App Store actions, with location and `result_exposed` |

Payloads carry bounded experiment, phase, copy/measurement version and release
labels. The adapter rejects unapproved fields/values. No form values, names,
dates, schedule type, full URLs/referrers, persistent user ID, IP property,
advertising identifier or revenue value is added. Requests omit credentials
and referrer. As with any browser request, the provider sees network transport
information. Existing Google Ads measurement remains separate.

The result App Store campaign changes to `duet_calc_value_c_202609` or
`duet_calc_value_t_202609` only after a recorded eligible exposure. Other buttons
and unqualified result clicks retain their existing token. The existing
`site.js` click payload reads the actual destination token, preserving Ads and
Apple consistency. Tracking never prevents navigation. The exposure is replayed
with a result click using the same insert ID so the ingestion service can dedupe
it and recover a lost initial exposure request. Storage by itself is not proof
of successful ingestion.

## Exact reporting definition

Within one complete phase's UTC window, filter `experiment_id=
calculator_shared_value_202609`, the exact `phase`, `release` and
`measurement_version=result_visibility_v1`:

- Denominator: `calculator_result_viewed` unique session identities across the
  whole window. Use Amplitude `overallSeries`, not daily sums. Because this
  separate project's identity is session-scoped, label the result **sessions**.
- Numerator: unique session identities for `app_store_clicked` with
  `cta_location=calculator-result` and `result_exposed=true`, restricted to
  identities whose matching phase/release exposure occurred within that same
  UTC window. The client sets that flag only after an earlier qualified exposure.
  Both events must be in the phase window. An active session can last longer
  than 30 minutes, so do not impose a 30-minute funnel-conversion limit; only
  inactivity expires its identity. Count each session once. Do not use all clicks.
- Guardrails: generated sessions, PDF-export sessions, other CTA counts,
  exclusions/measurement coverage and browser checks. Store receipt is a
  readiness check; actual queried exposure is required to say the pilot ran.

Keep Apple campaign outcomes separate from this web funnel and app Amplitude.
Suppressed/missing Apple reports are unavailable, not zero. Outbound clicks are
not installs or revenue, and tokens do not establish a cross-source user join.

## Validation

Run the existing site/attribution checks plus `node
scripts/test_calculator_experiment.cjs` and `node
scripts/test_calculator_analytics.cjs`. The browser harness under
`docs/qa/calculator-value-copy/` uses synthetic form data, intercepted analytics
and intercepted App Store navigation. Its receipt pins tested source hashes and
the 320/390/768/1440px screenshots. The real existing jsPDF library is loaded
only for the PDF download check. No production analytics, purchase or paid
campaign is sent by the harness.

Transport contract: [Amplitude HTTP V2 documentation](https://amplitude.com/docs/apis/analytics/http-v2).
