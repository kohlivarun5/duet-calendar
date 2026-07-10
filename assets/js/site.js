(function () {
  var appStoreLinks = document.querySelectorAll(".js-app-store-link");
  var queryParams = new URLSearchParams(window.location.search);
  var pageSlug = document.body.dataset.pageSlug || window.location.pathname.split("/").filter(Boolean).pop() || "home";
  var isGooglePaid =
    queryParams.get("utm_source") === "google" ||
    queryParams.has("gclid") ||
    queryParams.has("gbraid") ||
    queryParams.has("wbraid");
  var organicCampaignToken = "duet_web_" + pageSlug.replace(/[^a-z0-9]+/gi, "_").toLowerCase() + "_202607";
  var campaignToken = isGooglePaid ? "duet_google_search_202607" : organicCampaignToken;
  var trafficSource = isGooglePaid ? "google_paid" : "organic_or_direct";
  var holidayPageSlugs = ["holiday-custody-schedule", "summer-custody-schedule", "school-break-custody-schedule"];
  var schedulePageSlugs = [
    "custody-schedule-calculator",
    "2-2-3-custody-schedule",
    "2-2-5-5-custody-schedule",
    "3-4-4-3-custody-schedule",
    "week-on-week-off-custody-schedule",
    "50-50-custody-calendar",
    "alternating-weekends-custody-schedule",
    "custody-handoff-calendar",
  ];
  var productPageID = holidayPageSlugs.includes(pageSlug)
    ? "f5d8dd2d-228a-40c6-b74d-49815c1ca634"
    : schedulePageSlugs.includes(pageSlug)
      ? "87fdba48-108d-4ed2-8710-4772189f6bb2"
      : "a4de00f6-f673-4e65-9ccd-a66aff48824a";

  appStoreLinks.forEach(function (link) {
    try {
      var destination = new URL(link.href);
      destination.searchParams.set("ct", campaignToken);
      destination.searchParams.set("ppid", productPageID);
      link.href = destination.toString();
    } catch (error) {
      // Keep the original App Store destination if a malformed URL slips through.
    }
  });

  function trackEvent(name, params) {
    if (typeof window.gtag !== "function") {
      return;
    }

    window.gtag("event", name, Object.assign({
      page_path: window.location.pathname,
    }, params || {}));
  }

  window.duetTrackEvent = trackEvent;

  appStoreLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      var destination = link.href;
      var hasGoogleTag = typeof window.gtag === "function";
      var didNavigate = false;

      function navigateToAppStore() {
        if (!didNavigate) {
          didNavigate = true;
          window.location.href = destination;
        }
      }

      if (!hasGoogleTag) {
        return;
      }

      event.preventDefault();

      var clickEventParams = {
        app_store_campaign_token: campaignToken,
        cta_location: link.dataset.ctaLocation || "unknown",
        campaign_token: campaignToken,
        custom_product_page_id: productPageID,
        landing_page: pageSlug,
        link_url: destination,
        traffic_source: trafficSource,
        transport_type: "beacon",
      };

      trackEvent("app_store_clicked", clickEventParams);

      if (window.duetAdsConfig && window.duetAdsConfig.conversionSendTo) {
        window.gtag("event", "conversion", {
          send_to: window.duetAdsConfig.conversionSendTo,
          value: 1.0,
          currency: "USD",
          cta_location: clickEventParams.cta_location,
          link_url: clickEventParams.link_url,
          event_callback: navigateToAppStore,
          event_timeout: 800,
        });
      } else {
        window.gtag("event", "app_store_cta_click", {
          cta_location: clickEventParams.cta_location,
          link_url: clickEventParams.link_url,
          transport_type: clickEventParams.transport_type,
          event_callback: navigateToAppStore,
          event_timeout: 800,
        });
      }

      window.setTimeout(navigateToAppStore, 900);
    });
  });
})();
