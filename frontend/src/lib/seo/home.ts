import type { FaqItem, SiteSettings } from "@/types/content";

const origin = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru").replace(/\/$/u, "");

export function buildHomepageStructuredData({
  faq,
  settings,
}: {
  faq: FaqItem[];
  settings: SiteSettings;
}): Record<string, unknown>[] {
  const siteUrl = origin();
  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.legalName || settings.companyName,
    url: siteUrl,
  };
  if (settings.phone) organization.telephone = settings.phone;
  if (settings.email) organization.email = settings.email;
  if (settings.legalAddress || settings.address || settings.city) {
    organization.address = {
      "@type": "PostalAddress",
      addressLocality: settings.city || undefined,
      streetAddress: settings.legalAddress || settings.address || undefined,
    };
  }

  const schemas: Record<string, unknown>[] = [
    organization,
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings.companyName,
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/catalog?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
  if (faq.length) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }
  return schemas;
}

