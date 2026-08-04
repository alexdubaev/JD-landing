import type { Product, ProductCardData } from "@/types/catalog";
import type { FaqItem, SiteSettings } from "@/types/content";

import { directusAssetUrl } from "@/lib/directus/assets";

import { absoluteUrl } from "./url";

export type BreadcrumbItem = {
  name: string;
  url: string;
};

/** Build a BreadcrumbList JSON-LD node from visible breadcrumb items. */
export function buildBreadcrumbSchema(
  items: BreadcrumbItem[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build a FAQPage JSON-LD node from FAQ items. Returns null for an empty list
 * so callers can skip emitting an empty schema.
 */
export function buildFaqSchema(
  faq: FaqItem[],
): Record<string, unknown> | null {
  if (!faq.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * Build a CollectionPage JSON-LD node. `isPartOf` ties the page to the WebSite,
 * matching the pattern used by well-structured catalogs.
 */
export function buildCollectionPageSchema({
  name,
  url,
  description,
}: {
  name: string;
  url: string;
  description?: string | null;
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url,
    isPartOf: {
      "@type": "WebSite",
      url: absoluteUrl("/"),
    },
  };
  if (description) {
    schema.description = description;
  }
  return schema;
}

/** Map internal availability status to Schema.org ItemAvailability. */
export function schemaAvailability(
  status: ProductCardData["availabilityStatus"],
): string | null {
  switch (status) {
    case "in_stock":
      return "https://schema.org/InStock";
    case "on_request":
      return "https://schema.org/PreOrder";
    case "out_of_stock":
      return "https://schema.org/OutOfStock";
    default:
      return null;
  }
}

type ProductSchemaInput = {
  product: Product;
  categorySlug: string;
};

/**
 * Build a Product JSON-LD node using only confirmed CMS data.
 * Generates an Offer only when a valid price is visible on the page.
 */
export function buildProductSchema({
  product,
  categorySlug,
}: ProductSchemaInput): Record<string, unknown> {
  const productUrl = absoluteUrl(
    `/catalog/${categorySlug}/${product.slug}`,
  );
  const imageUrl = directusAssetUrl(product.mainImageId, {
    width: 1200,
    height: 900,
    fit: "contain",
  });

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.title,
    sku: product.sku,
    url: productUrl,
  };

  if (product.shortDescription) {
    schema.description = product.shortDescription;
  }

  if (imageUrl) {
    schema.image = imageUrl;
  }

  if (product.brand) {
    schema.brand = {
      "@type": "Brand",
      name: product.brand,
    };
  }

  if (product.category) {
    schema.category = product.category.title;
  }

  if (product.mpn) {
    schema.mpn = product.mpn;
  }

  if (product.gtin) {
    schema.gtin = product.gtin;
  }

  // Generate Offer only when a valid numeric price is visible.
  const hasVisiblePrice =
    product.priceStatus === "fixed" &&
    product.price != null &&
    product.price > 0;

  if (hasVisiblePrice) {
    const availability = schemaAvailability(product.availabilityStatus);
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      url: productUrl,
      price: product.price,
      priceCurrency: product.currency,
    };
    if (availability) {
      offer.availability = availability;
    }
    offer.seller = { "@id": `${absoluteUrl("/")}#organization` };
    schema.offers = offer;
  }

  return schema;
}

/** Build an Organization JSON-LD node using only confirmed Directus fields. */
export function buildOrganizationSchema(
  settings: SiteSettings,
): Record<string, unknown> {
  const siteUrl = absoluteUrl("/");
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}#organization`,
    name: settings.legalName || settings.companyName,
    url: siteUrl,
  };

  if (settings.phone) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      telephone: settings.phone,
      contactType: "sales",
    };
  }

  if (settings.email) {
    schema.email = settings.email;
  }

  if (settings.legalAddress || settings.address || settings.city) {
    schema.address = {
      "@type": "PostalAddress",
      addressLocality: settings.city || undefined,
      streetAddress: settings.legalAddress || settings.address || undefined,
    };
  }

  return schema;
}

/** Build a WebSite JSON-LD node. */
export function buildWebSiteSchema(
  settings: SiteSettings,
): Record<string, unknown> {
  const siteUrl = absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}#website`,
    name: settings.companyName,
    url: siteUrl,
    publisher: { "@id": `${siteUrl}#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/catalog?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}