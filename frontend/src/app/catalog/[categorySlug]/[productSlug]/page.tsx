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
import { getFaqItems } from "@/lib/directus/content";

type ProductRouteProps = {
  params: Promise<{ categorySlug: string; productSlug: string }>;
};

export const revalidate = 300;

export async function generateMetadata({
  params,
}: ProductRouteProps): Promise<Metadata> {
  const { categorySlug, productSlug } = await params;
  const product = await getProductBySlugs(categorySlug, productSlug);
  if (!product) return {};
  const image = directusAssetUrl(
    product.ogImageId || product.mainImageId,
    { width: 1200, height: 630, fit: "contain" },
  );

  return {
    title: product.seoTitle || product.title,
    description: product.seoDescription || product.shortDescription,
    alternates: {
      canonical: `/catalog/${categorySlug}/${productSlug}`,
    },
    openGraph: image ? { images: [image] } : undefined,
  };
}

export default async function ProductPage({ params }: ProductRouteProps) {
  const { categorySlug, productSlug } = await params;
  const product = await getProductBySlugs(categorySlug, productSlug);
  if (!product) notFound();
  const [documents, relatedProducts, faq] = await Promise.all([
    getFilesByIds(product.documentIds),
    getProductsByIds(product.relatedProductIds),
    getFaqItems({ productId: product.id }).catch(() => []),
  ]);

  return (
    <main className="product-page" id="main-content">
      <Container>
        <JsonLdSchema
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            sku: product.sku,
            description: product.shortDescription,
            image: directusAssetUrl(product.mainImageId, {
              width: 1200,
              height: 900,
              fit: "contain",
            }),
          }}
        />
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
