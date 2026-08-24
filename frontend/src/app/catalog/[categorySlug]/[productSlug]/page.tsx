import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductDetail } from "@/components/catalog/ProductDetail";
import { LeadForm } from "@/components/forms/LeadForm";
import { RelatedProducts } from "@/components/catalog/RelatedProducts";
import { SpecTable } from "@/components/catalog/SpecTable";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { JsonLdSchema } from "@/components/seo/JsonLdSchema";
import { AnimatedAccordion } from "@/components/ui/AnimatedAccordion";
import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import {
  getFilesByIds,
  getProductBySlugs,
  getProductsByIds,
} from "@/lib/directus/catalog";
import { getFaqItems, getSiteSettings } from "@/lib/directus/content";
import { buildSocialMetadata } from "@/lib/seo/social-metadata";
import { absoluteUrl } from "@/lib/seo/url";
import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildOrganizationSchema,
  buildProductSchema,
} from "@/lib/seo/schema";
import type { SiteSettings } from "@/types/content";

type ProductRouteProps = {
  params: Promise<{ categorySlug: string; productSlug: string }>;
};

export const revalidate = 300;

export async function generateMetadata({
  params,
}: ProductRouteProps): Promise<Metadata> {
  const { categorySlug, productSlug } = await params;
  const product = await getProductBySlugs(categorySlug, productSlug);
  // Not found: keep the page out of the index rather than serving an empty {}.
  if (!product) {
    return { robots: { index: false, follow: false } };
  }
  const canonical = `/catalog/${categorySlug}/${productSlug}`;
  const image =
    directusAssetUrl(product.ogImageId || product.mainImageId, {
      width: 1200,
      height: 630,
      fit: "contain",
    });
  const title = product.seoTitle || product.title;
  const description = product.seoDescription || product.shortDescription;

  return {
    title,
    description: description ?? undefined,
    alternates: { canonical },
    ...(product.isIndexable === false
      ? { robots: { index: false, follow: true } }
      : {}),
    ...buildSocialMetadata({
      title,
      description: description ?? undefined,
      type: "website",
      path: absoluteUrl(canonical),
      image: image
        ? { url: image, alt: product.imageAlt || product.title }
        : null,
    }),
  };
}

async function getProductPageSettings(): Promise<SiteSettings | null> {
  try {
    return await getSiteSettings();
  } catch {
    return null;
  }
}

export default async function ProductPage({ params }: ProductRouteProps) {
  const { categorySlug, productSlug } = await params;
  const product = await getProductBySlugs(categorySlug, productSlug);
  if (!product) notFound();
  const [documents, relatedProducts, faq, settings] = await Promise.all([
    getFilesByIds(product.documentIds),
    getProductsByIds(product.relatedProductIds),
    getFaqItems({ productId: product.id }).catch(() => []),
    getProductPageSettings(),
  ]);

  const breadcrumbItems = [
    { name: "Главная", url: absoluteUrl("/") },
    { name: "Каталог", url: absoluteUrl("/catalog") },
    ...(product.category
      ? [
          {
            name: product.category.title,
            url: absoluteUrl(`/catalog/${product.category.slug}`),
          },
        ]
      : []),
    {
      name: product.title,
      url: absoluteUrl(`/catalog/${categorySlug}/${productSlug}`),
    },
  ];

  const faqSchema = buildFaqSchema(faq);

  return (
    <main className="product-page" id="main-content">
      <JsonLdSchema
        data={buildProductSchema({ product, categorySlug })}
      />
      <JsonLdSchema data={buildBreadcrumbSchema(breadcrumbItems)} />
      {settings ? (
        <JsonLdSchema data={buildOrganizationSchema(settings)} />
      ) : null}
      {faqSchema ? <JsonLdSchema data={faqSchema} /> : null}
      <Container>
        <Breadcrumbs
          items={[
            { href: "/", label: "Главная" },
            { href: "/catalog", label: "Каталог" },
            ...(product.category
              ? [
                  {
                    href: `/catalog/${product.category.slug}`,
                    label: product.category.title,
                  },
                ]
              : []),
            { label: product.title },
          ]}
        />
        <ProductDetail documents={documents} product={product} />
        <SpecTable specifications={product.specifications} />
        {faq.length ? (
          <section className="product-section" aria-labelledby="product-faq">
            <h2 id="product-faq">Вопросы о товаре</h2>
            <AnimatedAccordion items={faq} />
          </section>
        ) : null}
        <RelatedProducts products={relatedProducts} />
        <section
          aria-labelledby="product-consultation"
          className="product-section product-consultation"
          id="consultation"
        >
          <h2 id="product-consultation">Уточнить совместимость и условия</h2>
          <LeadForm
            categoryId={product.category?.id}
            productId={product.id}
          />
        </section>
      </Container>
    </main>
  );
}
