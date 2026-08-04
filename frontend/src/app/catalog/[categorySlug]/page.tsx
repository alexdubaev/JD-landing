import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { CatalogControls } from "@/components/catalog/CatalogControls";
import { EmptyCatalog } from "@/components/catalog/EmptyCatalog";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { JsonLdSchema } from "@/components/seo/JsonLdSchema";
import { Container } from "@/components/ui/Container";
import {
  type CatalogSearchParams,
  parseCatalogSearchParams,
} from "@/lib/catalog/search-params";
import { directusAssetUrl } from "@/lib/directus/assets";
import {
  getCatalogPage,
  getCategoryBySlug,
  getCategoryRedirect,
} from "@/lib/directus/catalog";
import {
  buildCatalogMetadata,
  isPageOutOfRange,
} from "@/lib/seo/catalog-metadata";
import { absoluteUrl } from "@/lib/seo/url";
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
} from "@/lib/seo/schema";

export const revalidate = 300;

type CategoryRouteProps = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: CategoryRouteProps): Promise<Metadata> {
  const [{ categorySlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return {};

  const image = directusAssetUrl(category.ogImageId || category.imageId, {
    width: 1200,
    height: 630,
    fit: "contain",
  });

  return buildCatalogMetadata({
    query: parseCatalogSearchParams(rawSearchParams),
    basePath: `/catalog/${category.slug}`,
    title: category.seoTitle || category.title,
    description: category.seoDescription || category.description,
    image,
    indexable: category.isIndexable,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryRouteProps) {
  const [{ categorySlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const category = await getCategoryBySlug(categorySlug);
  if (!category) {
    const redirectTarget = await getCategoryRedirect(categorySlug);
    if (redirectTarget) permanentRedirect(`/catalog/${redirectTarget}`);
    notFound();
  }
  const query = {
    ...parseCatalogSearchParams(rawSearchParams),
    categorySlug,
  };
  const catalog = await getCatalogPage(query);

  // 404 for out-of-range page numbers
  if (isPageOutOfRange(query, catalog.total)) notFound();

  const breadcrumbItems = [
    { name: "Главная", url: absoluteUrl("/") },
    { name: "Каталог", url: absoluteUrl("/catalog") },
    { name: category.title, url: absoluteUrl(`/catalog/${category.slug}`) },
  ];

  return (
    <main className="catalog-page" id="main-content">
      <JsonLdSchema
        data={buildCollectionPageSchema({
          name: category.title,
          url: absoluteUrl(`/catalog/${category.slug}`),
          description: category.description,
        })}
      />
      <JsonLdSchema data={buildBreadcrumbSchema(breadcrumbItems)} />
      <Container>
        <Breadcrumbs
          items={[
            { href: "/", label: "Главная" },
            { href: "/catalog", label: "Каталог" },
            { label: category.title },
          ]}
        />
        <header className="catalog-heading">
          <p className="catalog-heading__eyebrow">Категория продукции</p>
          <h1>{category.h1 || category.title}</h1>
          {category.description ? <p>{category.description}</p> : null}
        </header>
        <Suspense fallback={<div className="catalog-controls-skeleton" />}>
          <CatalogControls categorySlug={categorySlug} />
        </Suspense>
        <div className="catalog-results">
          <p aria-live="polite">
            Найдено позиций: <strong>{catalog.total}</strong>
          </p>
        </div>
        {catalog.items.length ? (
          <ProductGrid products={catalog.items} />
        ) : (
          <EmptyCatalog />
        )}
        <Pagination
          currentPage={catalog.page}
          pageSize={catalog.pageSize}
          pathname={`/catalog/${categorySlug}`}
          searchParams={rawSearchParams}
          total={catalog.total}
        />
      </Container>
    </main>
  );
}