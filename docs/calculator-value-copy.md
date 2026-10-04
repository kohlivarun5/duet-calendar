# Calculator value copy

The result section now explains ongoing coordination in Duet: parenting days, holidays, family events, chats, tasks, and shared expenses. It distinguishes the free private calendar from Duet Shared monthly/yearly subscriptions and clarifies that an invited co-parent needs no second subscription. The action reads **Start free in Duet**.

On October 3, 2026, the user authorized publishing this copy without Amplitude tracking. This is a normal content update, not a measured pilot or A/B test. No browser Amplitude adapter, session identity, exposure event, experiment phase, or new campaign token is included. There is no claim of conversion lift. Existing site attribution and Google Ads configuration are unchanged; no campaign activation or spending change is included.

The calculator, PDF download, shared-preview links, existing App Store destination parameters, device requirements, and notice that the website does not automatically import into the app remain available. The result copy is visible with the existing result rather than being gated by analytics.

## Validation

Run the existing site/attribution checks from the README. `docs/qa/calculator-value-copy/browser-qa.cjs` uses an isolated browser context, synthetic inputs, intercepted outbound analytics and App Store navigation, and the existing jsPDF library. It verifies copy and layout at 320, 390, 768 and 1440 pixels, PDF download, organic/paid/custom destination parameters, and the absence of Amplitude requests or added session storage. Screenshots and a source-hashed receipt are saved in its `evidence` folder.

Publishing and live verification are recorded in the PR. Local browser evidence alone does not establish deployment.
