import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductDetail } from "@/components/catalog/ProductDetail";
import { RelatedProducts } from "@/components/catalog/RelatedProducts";
import { SpecTable } from "@/components/catalog/SpecTable";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import {
  getFilesByIds,
  getProductBySlugs,
  getProductsByIds,
} from "@/lib/directus/catalog";

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
    openGraph: image ? { images: [image] } : undefined,
  };
}

export default async function ProductPage({ params }: ProductRouteProps) {
  const { categorySlug, productSlug } = await params;
  const product = await getProductBySlugs(categorySlug, productSlug);
  if (!product) notFound();
  const [documents, relatedProducts] = await Promise.all([
    getFilesByIds(product.documentIds),
    getProductsByIds(product.relatedProductIds),
  ]);

  return (
    <main className="product-page" id="main-content">
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
        <RelatedProducts products={relatedProducts} />
      </Container>
    </main>
  );
}
