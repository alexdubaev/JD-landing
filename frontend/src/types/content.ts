export type NavigationItem = {
  id: string;
  label: string;
  url: string;
};

export type SiteSettings = {
  city: string | null;
  companyImageId: string | null;
  companyName: string;
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
  inn: string | null;
  kpp: string | null;
  legalAddress: string | null;
  legalName: string | null;
  messengers: unknown[];
  ogrn: string | null;
  requisitesUrl: string | null;
  vatInfo: string | null;
};

export type SectionType =
  | "advantages"
  | "articles"
  | "categories"
  | "contacts"
  | "cta"
  | "faq"
  | "featured_products"
  | "hero"
  | "lead_form"
  | "process"
  | "seo_text";

export type PageSection = {
  id: string;
  type: SectionType;
  title: string | null;
  subtitle: string | null;
  text: string | null;
  imageId: string | null;
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

export type HeroBlock = {
  id: string;
  eyebrow: string | null;
  title: string;
  text: string | null;
  imageId: string | null;
  imageAlt: string | null;
  primaryCtaText: string | null;
  primaryCtaUrl: string | null;
  secondaryCtaText: string | null;
  secondaryCtaUrl: string | null;
  disclaimer: string | null;
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

export type SeoTextBlock = {
  id: string;
  h1: string | null;
  introText: string | null;
  contentBlocks: unknown[];
  conclusionText: string | null;
  ctaText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
};
