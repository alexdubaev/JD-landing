import { afterEach, describe, expect, it } from "vitest";

import { trackEvent } from "./analytics";

describe("trackEvent", () => {
  afterEach(() => {
    delete window.dataLayer;
  });

  it("pushes provider-neutral events to dataLayer when available", () => {
    window.dataLayer = [];

    trackEvent("faq_open", { question: "Как отправить список артикулов?" });

    expect(window.dataLayer).toEqual([
      { event: "faq_open", question: "Как отправить список артикулов?" },
    ]);
  });

  it("does not throw when analytics is not installed", () => {
    expect(() => trackEvent("lead_submit")).not.toThrow();
  });
});
