import { afterEach, describe, expect, it } from "vitest";

import {
  COOKIE_CONSENT_STORAGE_KEY,
  hasAnalyticsConsent,
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
