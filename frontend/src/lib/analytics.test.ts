import { afterEach, describe, expect, it } from "vitest";

import {
  COOKIE_CONSENT_STORAGE_KEY,
  collectUtmAttribution,
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
    window.dataLayer = [];

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
