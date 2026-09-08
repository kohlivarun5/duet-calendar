(function () {
  var appStoreLinks = document.querySelectorAll(".js-app-store-link");
  var queryParams = new URLSearchParams(window.location.search);
  var pageSlug = document.body.dataset.pageSlug || window.location.pathname.split("/").filter(Boolean).pop() || "home";
  var isGooglePaid =
    queryParams.get("utm_source") === "google" ||
    queryParams.has("gclid") ||
    queryParams.has("gbraid") ||
    queryParams.has("wbraid");
  var inboundCampaign = queryParams.get("utm_campaign");
  var paidCampaignTokens = {
    duet_google_pmax_20260807: "duet_google_pmax_20260807",
    duet_search_bridge_cta_2026_05: "duet_search_bridge_cta_2026_05",
  };
  var attributedPaidCampaignToken = Object.prototype.hasOwnProperty.call(
    paidCampaignTokens,
    inboundCampaign
  ) ? paidCampaignTokens[inboundCampaign] : null;
  var isGooglePMax = inboundCampaign === "duet_google_pmax_20260807";
  var organicCampaignToken = "duet_web_" + pageSlug.replace(/[^a-z0-9]+/gi, "_").toLowerCase() + "_202607";
  var campaignToken = attributedPaidCampaignToken ||
    (isGooglePaid ? "duet_google_search_202607" : organicCampaignToken);
  var trafficSource = isGooglePMax
    ? "google_pmax"
    : isGooglePaid
      ? "google_paid"
      : "organic_or_direct";
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
  // Product pages use the current default listing; existing campaign and schedule
  // destinations retain their dedicated custom product pages.
  var currentProductPageSlugs = ["home", "co-parenting-expenses", "parenting-schedule-swaps", "ai-family-calendar", "shared-family-calendar"];
  var useDefaultListing = !isGooglePaid && !attributedPaidCampaignToken && currentProductPageSlugs.includes(pageSlug);
  var productPageID = useDefaultListing
    ? null
    : holidayPageSlugs.includes(pageSlug)
    ? "f5d8dd2d-228a-40c6-b74d-49815c1ca634"
    : schedulePageSlugs.includes(pageSlug)
      ? "87fdba48-108d-4ed2-8710-4772189f6bb2"
      : "a4de00f6-f673-4e65-9ccd-a66aff48824a";

  appStoreLinks.forEach(function (link) {
    try {
      var destination = new URL(link.href);
      destination.searchParams.set("ct", campaignToken);
      if (productPageID) {
        destination.searchParams.set("ppid", productPageID);
      } else {
        destination.searchParams.delete("ppid");
      }
      link.href = destination.toString();
    } catch (error) {
      // Keep the original App Store destination if a malformed URL slips through.
    }
  });

  // Keep paid acquisition context when a visitor explores another site page.
  // Only the parameters used above are forwarded, and only to this same origin.
  // No storage is needed and unrelated query data never follows the visitor.
  var attributionKeys = ["utm_source", "utm_campaign", "gclid", "gbraid", "wbraid"];
  if (isGooglePaid || attributedPaidCampaignToken) {
    document.querySelectorAll("a[href]").forEach(function (link) {
      try {
        var target = new URL(link.href, window.location.href);
        if (target.origin !== window.location.origin) {
          return;
        }
        attributionKeys.forEach(function (key) {
          if (queryParams.has(key) && !target.searchParams.has(key)) {
            target.searchParams.set(key, queryParams.get(key));
          }
        });
        link.href = target.toString();
      } catch (error) {
        // Leave non-URL actions and malformed links unchanged.
      }
    });
  }

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
