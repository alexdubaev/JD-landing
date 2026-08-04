import { describe, expect, it } from "vitest";

import { buildHomepageStructuredData } from "./home";

describe("buildHomepageStructuredData", () => {
  it("builds factual organization, website search and FAQ schemas", () => {
    const schemas = buildHomepageStructuredData({
      faq: [{ id: "faq", question: "Как отправить список?", answer: "Через форму." }],
      settings: {
        address: null, accentColor: null, city: "Санкт-Петербург", companyImageId: null,
        companyName: "DEERE-SHOP", defaultOgImageId: null, documentsUrl: null, email: "info@example.test", footerDisclaimer: null, footerText: null,
        inn: "7812345678", kpp: null, legalAddress: null, legalName: "ООО «СМ ТЕХНО»", logoId: null,
        messengers: [], ogrn: null, ogDescription: null, ogTitle: null, phone: "+7 900 000-00-00", primaryColor: null,
        primaryCtaText: null, primaryCtaUrl: null, requisitesUrl: null, seoDescription: null, seoTitle: null, vatInfo: null, workingHours: null, yandexMetricaId: null, gtmId: null,
      },
    });

    expect(schemas).toEqual(expect.arrayContaining([
      expect.objectContaining({ "@type": "Organization", name: "ООО «СМ ТЕХНО»" }),
      expect.objectContaining({ "@type": "WebSite", potentialAction: expect.objectContaining({ "@type": "SearchAction" }) }),
      expect.objectContaining({ "@type": "FAQPage" }),
    ]));
    expect(JSON.stringify(schemas)).not.toContain("offers");
  });
});
