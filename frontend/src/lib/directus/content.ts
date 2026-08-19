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
import { parseSeoJson, resolveSeo } from "@/lib/seo/directus-seo";

import { directusRequest, directusVersionedRequest, readPreviewContext } from "./client";

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
  /** R11 additive plugin JSON (null until the CMS migration fills it). */
  seo?: unknown;
};

type RawHomePage = {
  id: string;
  status: string;
  source_page: FileRelation;
  h1: string | null;
  hero_title: string | null;
  hero_text: string | null;
  hero_image: FileRelation;
  hero_image_alt: string | null;
  hero_primary_button_text: string | null;
  hero_primary_button_url: string | null;
  hero_secondary_button_text: string | null;
  hero_secondary_button_url: string | null;
  hero_search_label: string | null;
  hero_search_placeholder: string | null;
  hero_search_button_text: string | null;
  hero_bulk_prompt: string | null;
  hero_bulk_link_text: string | null;
  hero_bulk_link_url: string | null;
  hero_excel_link_text: string | null;
  hero_excel_link_url: string | null;
  hero_photo_link_text: string | null;
  hero_photo_link_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  /** R11 additive plugin JSON (null until the CMS migration fills it). */
  seo?: unknown;
};

type RawSection = {
  id: string;
  section_type: string;
  title: string | null;
  subtitle: string | null;
  text: string | null;
  image: FileRelation;
  image_alt: string | null;
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
    imageAlt: raw.image_alt,
    buttonText: raw.button_text,
    buttonUrl: raw.button_url,
    items: toItems(raw.items),
    settings: toSettings(raw.settings),
    sortOrder: raw.sort_order ?? 0,
  };
};

export async function getPageBySlug(slug: string): Promise<ContentPage | null> {
  // Task 16 preview: with a valid draft context the page row is read through
  // its version overlay; the version's own slug must match the request so a
  // preview cookie cannot leak onto another page's URL. Sections stay on the
  // published fetch (page_sections are separate items, outside versioning).
  // Without a preview context the published fetches stay byte-identical.
  let page: RawPage | null = null;
  const preview = await readPreviewContext();
  if (preview?.collection === "pages") {
    const raw = await directusVersionedRequest<RawPage>(
      `/items/pages/${preview.id}?${queryString({
        fields: "id,title,slug,h1,seo_title,seo_description,seo_text,seo",
      })}`,
      { version: preview.version },
    ).catch(() => null);
    if (raw?.slug === slug) page = raw;
  }
  if (!page) {
    const pageQuery = queryString({
      "filter[status][_eq]": "published",
      "filter[slug][_eq]": slug,
      fields: "id,title,slug,h1,seo_title,seo_description,seo_text,seo",
      limit: "1",
    });
    const pages = await directusRequest<RawPage[]>(
      `/items/pages?${pageQuery}`,
      { next: { revalidate: 300, tags: ["pages", `page:${slug}`] } },
    );
    page = pages[0];
  }
  if (!page) return null;

  const sectionQuery = queryString({
    "filter[status][_eq]": "published",
    "filter[page][_eq]": page.id,
    "filter[is_visible][_eq]": "true",
    fields:
      "id,section_type,title,subtitle,text,image,image_alt,button_text,button_url,items,settings,sort_order,is_visible",
    sort: "sort_order",
    limit: "-1",
  });
  const rawSections = await directusRequest<RawSection[]>(
    `/items/page_sections?${sectionQuery}`,
    { next: { revalidate: 300, tags: ["page-sections", `page:${slug}`] } },
  );

  // R11 dual-read: plugin JSON first, scalars as per-key fallback. While seo
  // is null this reproduces the previous scalar mapping exactly.
  const seo = resolveSeo(page, {
    title: page.seo_title,
    description: page.seo_description,
  });

  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    h1: page.h1,
    seoTitle: seo.title,
    seoDescription: seo.description,
    seoText: page.seo_text,
    seo: parseSeoJson(page.seo),
    sections: rawSections
      .map(mapSection)
      .filter((section): section is PageSection => section !== null),
  };
}

const requiredText = (value: string | null) => value?.trim() || null;

export async function getHomePage(): Promise<ContentPage | null> {
  const fields = [
    "id", "status", "source_page", "h1", "hero_title", "hero_text",
    "hero_image", "hero_image_alt", "hero_primary_button_text",
    "hero_primary_button_url", "hero_secondary_button_text",
    "hero_secondary_button_url", "hero_search_label", "hero_search_placeholder",
    "hero_search_button_text", "hero_bulk_prompt", "hero_bulk_link_text",
    "hero_bulk_link_url", "hero_excel_link_text", "hero_excel_link_url",
    "hero_photo_link_text", "hero_photo_link_url", "seo_title", "seo_description",
    "seo",
  ].join(",");
  // Task 16 preview: the singleton is read through its version overlay when a
  // valid draft context exists; the published status gate only applies to the
  // published fetch so a draft main item can still be previewed. Sections stay
  // on the published fetch (page_sections are outside versioning). Without a
  // preview context the published fetch stays byte-identical.
  const preview = await readPreviewContext();
  const versionedPreview = preview?.collection === "home_page" ? preview : null;
  const raw = versionedPreview
    ? await directusVersionedRequest<RawHomePage>(
        `/items/home_page?${queryString({ fields })}`,
        { version: versionedPreview.version },
      )
    : await directusRequest<RawHomePage>(
        `/items/home_page?${queryString({ fields })}`,
        { next: { revalidate: 300, tags: ["homepage"] } },
      );
  if (!raw || (!versionedPreview && raw.status !== "published")) return null;

  const title = requiredText(raw.hero_title);
  const text = requiredText(raw.hero_text);
  const imageId = fileId(raw.hero_image);
  const imageAlt = requiredText(raw.hero_image_alt);
  const h1 = requiredText(raw.h1);
  const sourcePageId = fileId(raw.source_page);
  if (!title || !text || !imageId || !imageAlt || !h1 || !sourcePageId) {
    throw new Error("Invalid homepage hero content");
  }

  const hero: PageSection = {
    id: `${raw.id}:hero`,
    type: "hero",
    title,
    subtitle: null,
    text,
    imageId,
    imageAlt,
    buttonText: raw.hero_primary_button_text,
    buttonUrl: raw.hero_primary_button_url,
    items: [],
    settings: {
      secondary_cta_text: raw.hero_secondary_button_text,
      secondary_cta_url: raw.hero_secondary_button_url,
      search_label: raw.hero_search_label,
      search_placeholder: raw.hero_search_placeholder,
      search_button_text: raw.hero_search_button_text,
      bulk_prompt: raw.hero_bulk_prompt,
      bulk_link_text: raw.hero_bulk_link_text,
      bulk_link_url: raw.hero_bulk_link_url,
      excel_link_text: raw.hero_excel_link_text,
      excel_link_url: raw.hero_excel_link_url,
      photo_link_text: raw.hero_photo_link_text,
      photo_link_url: raw.hero_photo_link_url,
    },
    sortOrder: 0,
  };
  const sectionQuery = queryString({
    "filter[status][_eq]": "published",
    "filter[home_page][_eq]": raw.id,
    "filter[is_visible][_eq]": "true",
    fields:
      "id,section_type,title,subtitle,text,image,image_alt,button_text,button_url,items,settings,sort_order,is_visible",
    sort: "sort_order",
    limit: "-1",
  });
  const rawSections = await directusRequest<RawSection[]>(
    `/items/page_sections?${sectionQuery}`,
    { next: { revalidate: 300, tags: ["homepage"] } },
  );

  // R11 dual-read: plugin JSON first, scalars as per-key fallback. While seo
  // is null this reproduces the previous scalar mapping exactly.
  const seo = resolveSeo(raw, {
    title: raw.seo_title,
    description: raw.seo_description,
  });

  return {
    id: sourcePageId,
    title: h1,
    slug: "home",
    h1,
    seoTitle: seo.title,
    seoDescription: seo.description,
    seoText: null,
    seo: parseSeoJson(raw.seo),
    sections: [
      hero,
      ...rawSections
        .map(mapSection)
        .filter((section): section is PageSection => section !== null),
    ],
  };
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
