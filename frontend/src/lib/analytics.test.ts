import { afterEach, describe, expect, it } from "vitest";

import {
  COOKIE_CONSENT_STORAGE_KEY,
  collectUtmAttribution,
  configureAnalyticsProviders,
  flushMetricaEvents,
  hasAnalyticsConsent,
  persistUtmOnce,
  trackEvent,
} from "./analytics";

describe("trackEvent", () => {
  afterEach(() => {
    delete window.dataLayer;
    window.localStorage.clear();
  });

  it("does not push events before analytics consent", () => {
    window.dataLayer = [];

    trackEvent("faq_open", { question: "Как отправить список артикулов?" });

    expect(window.dataLayer).toEqual([]);
  });

  it("pushes provider-neutral events after analytics consent", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    configureAnalyticsProviders({ metricaId: null, gtmId: "GTM-ABC123" });

    trackEvent("faq_open", { question: "Как отправить список артикулов?" });

    expect(window.dataLayer).toEqual([
      { event: "faq_open", question: "Как отправить список артикулов?" },
    ]);
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it("does not push events after analytics consent is declined", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "declined");
    window.dataLayer = [];

    trackEvent("lead_submit");

    expect(window.dataLayer).toEqual([]);
  });

  it("does not throw when analytics is not installed", () => {
    expect(() => trackEvent("lead_submit")).not.toThrow();
  });
});

describe("collectUtmAttribution", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("returns only non-empty utm params from the current URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?utm_source=yandex&utm_campaign=spring&utm_content=",
    );

    expect(collectUtmAttribution()).toEqual({
      utm_source: "yandex",
      utm_campaign: "spring",
    });
  });

  it("returns an empty object without utm params", () => {
    window.history.replaceState(null, "", "/catalog");

    expect(collectUtmAttribution()).toEqual({});
  });
});

describe("persistUtmOnce", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("stores the landing utm params and survives in-site navigation", () => {
    window.history.replaceState(
      null,
      "",
      "/?utm_source=yandex&utm_campaign=spring",
    );
    persistUtmOnce();

    // The visitor browses; the query string is gone by submit time.
    window.history.replaceState(null, "", "/catalog/tractors");
    expect(collectUtmAttribution()).toEqual({
      utm_source: "yandex",
      utm_campaign: "spring",
    });
  });

  it("keeps the stored attribution when a later page has no utm params", () => {
    window.history.replaceState(null, "", "/?utm_source=direct");
    persistUtmOnce();

    window.history.replaceState(null, "", "/about");
    persistUtmOnce();

    expect(collectUtmAttribution()).toEqual({ utm_source: "direct" });
  });

  it("overwrites with the newest visit that carries utm params (last click)", () => {
    window.history.replaceState(null, "", "/?utm_source=first");
    persistUtmOnce();

    window.history.replaceState(null, "", "/?utm_source=second&utm_term=banner");
    persistUtmOnce();

    expect(collectUtmAttribution()).toEqual({
      utm_source: "second",
      utm_term: "banner",
    });
  });

  it("works without analytics consent (attribution, not tracking)", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "declined");
    window.history.replaceState(null, "", "/?utm_source=yandex");

    persistUtmOnce();

    expect(hasAnalyticsConsent()).toBe(false);
    expect(collectUtmAttribution()).toEqual({ utm_source: "yandex" });
  });
});

describe("provider-aware analytics dispatch", () => {
  afterEach(() => {
    delete window.dataLayer;
    window.localStorage.clear();
    delete window.ym;
    delete window.__jdMetricaInitialized;
    configureAnalyticsProviders({ metricaId: null, gtmId: null });
  });

  it("sends goals directly to Metrica in Metrica-only mode", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    const calls: unknown[][] = [];
    window.ym = (...args: unknown[]) => calls.push(args);
    window.__jdMetricaInitialized = { "12345678": true };
    configureAnalyticsProviders({ metricaId: "12345678", gtmId: null });

    trackEvent("lead_submit", { source: "lead_form" });

    expect(calls).toEqual([["12345678", "reachGoal", "lead_submit", { source: "lead_form" }]]);
    expect(window.dataLayer).toBeUndefined();
  });

  it("queues consented goals until Metrica is initialized and flushes them once", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    configureAnalyticsProviders({ metricaId: "12345678", gtmId: null });
    trackEvent("phone_click", { label: "header" });
    const calls: unknown[][] = [];
    window.ym = (...args: unknown[]) => calls.push(args);
    window.__jdMetricaInitialized = { "12345678": true };

    flushMetricaEvents();
    flushMetricaEvents();

    expect(calls).toEqual([["12345678", "reachGoal", "phone_click", { label: "header" }]]);
  });

  it("keeps GTM dataLayer events and also sends Metrica goals when both are configured", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    const calls: unknown[][] = [];
    window.ym = (...args: unknown[]) => calls.push(args);
    window.__jdMetricaInitialized = { "12345678": true };
    configureAnalyticsProviders({ metricaId: "12345678", gtmId: "GTM-ABC123" });

    trackEvent("order_submit", { order_id: "order-1" });

    expect(window.dataLayer).toEqual([{ event: "order_submit", order_id: "order-1" }]);
    expect(calls).toEqual([["12345678", "reachGoal", "order_submit", { order_id: "order-1" }]]);
  });

  it("keeps GTM-only dataLayer events without Metrica calls", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    configureAnalyticsProviders({ metricaId: null, gtmId: "GTM-ABC123" });

    trackEvent("faq_open");

    expect(window.dataLayer).toEqual([{ event: "faq_open" }]);
  });

  it("preserves events for a dataLayer installed by an external GTM integration", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    window.dataLayer = [];

    trackEvent("phone_click");

    expect(window.dataLayer).toEqual([{ event: "phone_click" }]);
  });

  it("does not flush queued goals after analytics consent is withdrawn", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    configureAnalyticsProviders({ metricaId: "12345678", gtmId: null });
    trackEvent("lead_submit");
    const calls: unknown[][] = [];
    window.ym = (...args: unknown[]) => calls.push(args);
    window.__jdMetricaInitialized = { "12345678": true };
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "declined");

    flushMetricaEvents();

    expect(calls).toEqual([]);
  });

  it("ignores invalid provider identifiers", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    configureAnalyticsProviders({ metricaId: "javascript:alert(1)", gtmId: "bad-id" });

    trackEvent("lead_submit");

    expect(window.dataLayer).toBeUndefined();
  });
});
