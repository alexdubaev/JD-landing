import type { FaqItem, SiteSettings } from "@/types/content";

import {
  buildFaqSchema,
  buildOrganizationSchema,
  buildWebSiteSchema,
} from "./schema";

export function buildHomepageStructuredData({
  faq,
  settings,
}: {
  faq: FaqItem[];
  settings: SiteSettings;
}): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [
    buildOrganizationSchema(settings),
    buildWebSiteSchema(settings),
  ];

  const faqSchema = buildFaqSchema(faq);
  if (faqSchema) {
    schemas.push(faqSchema);
  }
  return schemas;
}