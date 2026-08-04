import "server-only";

import type {
  ContentPage,
  ContactChannel,
  FaqItem,
  NavigationItem,
  PageSection,
  RecentSupply,
  SectionType,
  SiteSettings,
} from "@/types/content";
import { BRAND_NAME } from "@/lib/brand";

import { directusRequest } from "./client";

type FileRelation = string | { id: string } | null;

type RawSiteSettings = {
  city: string | null;
  company_image: FileRelation;
  company_name: string | null;
  default_og_image: FileRelation;
  documents_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  working_hours: string | null;
  logo: FileRelation;
  primary_color: string | null;
  accent_color: string | null;
  primary_cta_text: string | null;
  primary_cta_url: string | null;
  footer_text: string | null;
  footer_disclaimer: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  inn: string | null;
  kpp: string | null;
  legal_address: string | null;
  legal_name: string | null;
  messengers: unknown;
  ogrn: string | null;
  requisites_url: string | null;
  vat_info: string | null;
  yandex_metrica_id: string | null;
  gtm_id: string | null;
};

type RawPage = {
  id: string;
  title: string;
  slug: string;
  h1: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_text: string | null;
};

type RawSection = {
  id: string;
  section_type: string;
  title: string | null;
  subtitle: string | null;
  text: string | null;
  image: FileRelation;
  button_text: string | null;
  button_url: string | null;
  items: unknown;
  settings: unknown;
  sort_order: number | null;
  is_visible: boolean;
};

const sectionTypes = new Set<SectionType>([
  "advantages",
  "articles",
  "categories",
  "company_trust",
  "contacts",
  "cta",
  "faq",
  "featured_products",
  "hero",
  "lead_form",
  "parts_request",
  "process",
  "recent_supplies",
  "seo_text",
]);

const fileId = (relation: FileRelation) =>
  typeof relation === "string" ? relation : (relation?.id ?? null);

const toItems = (value: unknown) => (Array.isArray(value) ? value : []);

const toSettings = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const queryString = (parameters: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value) search.set(key, value);
  }
  return search.toString();
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const raw = await directusRequest<RawSiteSettings>(
    "/items/site_settings?fields=company_name,phone,email,address,working_hours,logo,primary_color,accent_color,primary_cta_text,primary_cta_url,footer_text,footer_disclaimer,messengers,legal_name,vat_info,requisites_url,documents_url,company_image,city,inn,kpp,ogrn,legal_address,default_og_image,seo_title,seo_description,og_title,og_description,yandex_metrica_id,gtm_id",
    { next: { revalidate: 300, tags: ["site-settings"] } },
  );

  return {
    city: raw.city,
    companyImageId: fileId(raw.company_image),
    companyName: raw.company_name?.trim() || BRAND_NAME,
    defaultOgImageId: fileId(raw.default_og_image),
    documentsUrl: raw.documents_url,
    phone: raw.phone,
    email: raw.email,
    address: raw.address,
    workingHours: raw.working_hours,
    logoId: fileId(raw.logo),
    primaryColor: raw.primary_color,
    accentColor: raw.accent_color,
    primaryCtaText: raw.primary_cta_text,
    primaryCtaUrl: raw.primary_cta_url,
    footerText: raw.footer_text,
    footerDisclaimer: raw.footer_disclaimer,
    seoTitle: raw.seo_title,
    seoDescription: raw.seo_description,
    ogTitle: raw.og_title,
    ogDescription: raw.og_description,
    inn: raw.inn,
    kpp: raw.kpp,
    legalAddress: raw.legal_address,
    legalName: raw.legal_name,
    messengers: toItems(raw.messengers),
    ogrn: raw.ogrn,
    requisitesUrl: raw.requisites_url,
    vatInfo: raw.vat_info,
    yandexMetricaId: raw.yandex_metrica_id,
    gtmId: raw.gtm_id,
  };
}

export async function getNavigation(): Promise<NavigationItem[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[parent][_null]": "true",
    fields: "id,label,url",
    sort: "sort_order",
    limit: "-1",
  });
  return directusRequest<NavigationItem[]>(`/items/navigation_items?${query}`, {
    next: { revalidate: 300, tags: ["navigation"] },
  });
}

const mapSection = (raw: RawSection): PageSection | null => {
  const normalizedType = raw.section_type === "steps" ? "process" : raw.section_type;
  if (!raw.is_visible || !sectionTypes.has(normalizedType as SectionType)) {
    return null;
  }

  return {
    id: raw.id,
    type: normalizedType as SectionType,
    title: raw.title,
    subtitle: raw.subtitle,
    text: raw.text,
    imageId: fileId(raw.image),
    buttonText: raw.button_text,
    buttonUrl: raw.button_url,
    items: toItems(raw.items),
    settings: toSettings(raw.settings),
    sortOrder: raw.sort_order ?? 0,
  };
};

export async function getPageBySlug(slug: string): Promise<ContentPage | null> {
  const pageQuery = queryString({
    "filter[status][_eq]": "published",
    "filter[slug][_eq]": slug,
    fields: "id,title,slug,h1,seo_title,seo_description,seo_text",
    limit: "1",
  });
  const pages = await directusRequest<RawPage[]>(
    `/items/pages?${pageQuery}`,
    { next: { revalidate: 300, tags: ["pages", `page:${slug}`] } },
  );
  const page = pages[0];
  if (!page) return null;

  const sectionQuery = queryString({
    "filter[status][_eq]": "published",
    "filter[page][_eq]": page.id,
    "filter[is_visible][_eq]": "true",
    fields:
      "id,section_type,title,subtitle,text,image,button_text,button_url,items,settings,sort_order,is_visible",
    sort: "sort_order",
    limit: "-1",
  });
  const rawSections = await directusRequest<RawSection[]>(
    `/items/page_sections?${sectionQuery}`,
    { next: { revalidate: 300, tags: ["page-sections", `page:${slug}`] } },
  );

  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    h1: page.h1,
    seoTitle: page.seo_title,
    seoDescription: page.seo_description,
    seoText: page.seo_text,
    sections: rawSections
      .map(mapSection)
      .filter((section): section is PageSection => section !== null),
  };
}

export function getHomePage(): Promise<ContentPage | null> {
  return getPageBySlug("home");
}

export async function getFaqItems({
  categoryId,
  pageId,
  productId,
}: {
  categoryId?: string;
  pageId?: string;
  productId?: string;
}): Promise<FaqItem[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[is_visible][_eq]": "true",
    "filter[page][_eq]": pageId,
    "filter[category][_eq]": categoryId,
    "filter[product][_eq]": productId,
    fields: "id,question,answer",
    sort: "sort_order",
    limit: "-1",
  });
  return directusRequest<FaqItem[]>(`/items/faq_items?${query}`, {
    next: { revalidate: 300, tags: ["faq"] },
  });
}

export async function getContacts(): Promise<ContactChannel[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[is_visible][_eq]": "true",
    fields: "id,channel_type,label,value,url,icon",
    sort: "sort_order",
    limit: "-1",
  });
  const items = await directusRequest<
    Array<{
      id: string;
      channel_type: string;
      label: string;
      value: string;
      url: string | null;
      icon: string | null;
    }>
  >(`/items/contact_channels?${query}`, {
    next: { revalidate: 300, tags: ["contact-channels"] },
  });
  return items.map((item) => ({
    id: item.id,
    type: item.channel_type,
    label: item.label,
    value: item.value,
    url: item.url,
    icon: item.icon,
  }));
}

export async function getRecentSupplies(): Promise<RecentSupply[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    fields: "id,image,image_alt,equipment_type,positions,region,delivery_term,supply_format,supplied_at",
    sort: "-supplied_at,sort_order",
    limit: "12",
  });
  const items = await directusRequest<Array<{
    id: string;
    image: FileRelation;
    image_alt: string | null;
    equipment_type: string | null;
    positions: unknown;
    region: string | null;
    delivery_term: string | null;
    supply_format: string | null;
    supplied_at: string | null;
  }>>(`/items/recent_supplies?${query}`, {
    next: { revalidate: 300, tags: ["recent-supplies"] },
  });
  return items.map((item) => ({
    alt: item.image_alt,
    deliveryTerm: item.delivery_term,
    equipmentType: item.equipment_type,
    id: item.id,
    imageId: fileId(item.image),
    positions: toItems(item.positions).filter(
      (position): position is string => typeof position === "string",
    ),
    region: item.region,
    suppliedAt: item.supplied_at,
    supplyFormat: item.supply_format,
  })).filter((supply) => Boolean(
    supply.imageId ||
      supply.equipmentType ||
      supply.positions.length ||
      supply.region ||
      supply.deliveryTerm ||
      supply.supplyFormat,
  ));
}
