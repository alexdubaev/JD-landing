import type { DirectusSeoJson } from "@/lib/seo/directus-seo";

export type NavigationItem = {
  id: string;
  label: string;
  url: string;
};

export type SiteSettings = {
  city: string | null;
  companyImageId: string | null;
  companyName: string;
  defaultOgImageId: string | null;
  documentsUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  workingHours: string | null;
  logoId: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  primaryCtaText: string | null;
  primaryCtaUrl: string | null;
  footerText: string | null;
  footerDisclaimer: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  inn: string | null;
  kpp: string | null;
  legalAddress: string | null;
  legalName: string | null;
  messengers: unknown[];
  ogrn: string | null;
  requisitesUrl: string | null;
  vatInfo: string | null;
  yandexMetricaId: string | null;
  gtmId: string | null;
};

export type SectionType =
  | "advantages"
  | "articles"
  | "categories"
  | "company_trust"
  | "contacts"
  | "cta"
  | "faq"
  | "featured_products"
  | "hero"
  | "lead_form"
  | "parts_request"
  | "process"
  | "recent_supplies"
  | "seo_text";

export type PageSection = {
  id: string;
  type: SectionType;
  title: string | null;
  subtitle: string | null;
  text: string | null;
  imageId: string | null;
  imageAlt?: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  items: unknown[];
  settings: Record<string, unknown>;
  sortOrder: number;
};

export type ContentPage = {
  id: string;
  title: string;
  slug: string;
  h1: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoText: string | null;
  /**
   * R11 dual-read: the additive @directus-labs/seo-plugin JSON of pages /
   * home_page. seoTitle/seoDescription above are already resolved JSON-first
   * with the scalars as per-key fallback. Null while the CMS-side migration
   * has not filled the field.
   */
  seo?: DirectusSeoJson | null;
  sections: PageSection[];
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type HomePageData = {
  page: ContentPage;
  settings: SiteSettings;
};

export type ContactChannel = {
  id: string;
  type: string;
  label: string;
  value: string;
  url: string | null;
  icon: string | null;
};

export type RecentSupply = {
  alt: string | null;
  deliveryTerm: string | null;
  equipmentType: string | null;
  id: string;
  imageId: string | null;
  positions: string[];
  region: string | null;
  suppliedAt: string | null;
  supplyFormat: string | null;
};
