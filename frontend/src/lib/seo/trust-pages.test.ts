import { describe, expect, it } from "vitest";

import {
  getTrustPageFallback,
  getTrustPageFaq,
  getTrustPageMetadata,
} from "./trust-pages";

describe("trust-page fallbacks", () => {
  it("returns an indexable delivery page with unique metadata", () => {
    expect(getTrustPageFallback("delivery")?.h1).toBe(
      "Доставка и оплата",
    );
    expect(getTrustPageMetadata("delivery")).toEqual({
      title: "Доставка и оплата запчастей John Deere — DEERE-SHOP",
      description: expect.stringContaining("доставки"),
    });
  });

  it("does not create a fallback for an unknown information slug", () => {
    expect(getTrustPageFallback("unknown")).toBeNull();
    expect(getTrustPageMetadata("unknown")).toBeNull();
  });

  it("does not include official-status or trademark disclaimers in public fallback content", () => {
    const aboutPage = getTrustPageFallback("about");
    const aboutText = aboutPage?.sections.map((section) => section.text).join(" ") ?? "";

    expect(aboutText).not.toMatch(/независим|официальн|товарн(?:ый|ого) знак|deere\s*&\s*company/iu);
  });

  it("provides the visible delivery FAQ when Directus is unavailable", () => {
    const faq = getTrustPageFaq("delivery");

    expect(faq).toHaveLength(12);
    expect(faq[0]).toMatchObject({
      question: "Работаете ли вы с НДС?",
      answer: expect.stringContaining("ООО «СМ ТЕХНО»"),
    });
  });
});
