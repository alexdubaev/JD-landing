import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CatalogControls } from "@/components/catalog/CatalogControls";
import { EmptyCatalog } from "@/components/catalog/EmptyCatalog";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/ui/Container";
import {
  type CatalogSearchParams,
  parseCatalogSearchParams,
} from "@/lib/catalog/search-params";
import { directusAssetUrl } from "@/lib/directus/assets";
import {
  getCatalogPage,
  getCategoryBySlug,
} from "@/lib/directus/catalog";

export const dynamic = "force-dynamic";

type CategoryRouteProps = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function generateMetadata({
  params,
}: CategoryRouteProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return {};
  const image = directusAssetUrl(category.ogImageId || category.imageId, {
    width: 1200,
    height: 630,
    fit: "contain",
  });

  return {
    title: category.seoTitle || category.title,
    description: category.seoDescription || category.description,
    openGraph: image ? { images: [image] } : undefined,
  };
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
  if (!category) notFound();
  const query = {
    ...parseCatalogSearchParams(rawSearchParams),
    categorySlug,
  };
  const catalog = await getCatalogPage(query);

  return (
    <main className="catalog-page" id="main-content">
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
