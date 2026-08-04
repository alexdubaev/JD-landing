import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  getCategories,
  getPageSeoBySlug,
} from "@/lib/directus/catalog";
import {
  buildCatalogMetadata,
  isPageOutOfRange,
} from "@/lib/seo/catalog-metadata";
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
} from "@/lib/seo/schema";
import { absoluteUrl } from "@/lib/seo/url";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const rawSearchParams = await searchParams;
  const query = parseCatalogSearchParams(rawSearchParams);
  const page = await getPageSeoBySlug("catalog");

  const title = page?.seoTitle || page?.title || "Каталог продукции";
  const description = page?.seoDescription;
  const image = directusAssetUrl(page?.ogImageId, {
    width: 1200,
    height: 630,
  });

  return buildCatalogMetadata({
    query,
    basePath: "/catalog",
    title,
    description,
    image,
    indexable: page?.isIndexable ?? true,
    canonicalPathOverride: page?.canonicalUrl ?? null,
  });
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const rawSearchParams = await searchParams;
  const query = parseCatalogSearchParams(rawSearchParams);
  const [catalog, categories, page] = await Promise.all([
    getCatalogPage(query),
    getCategories(),
    getPageSeoBySlug("catalog"),
  ]);

  // 404 for out-of-range page numbers
  if (isPageOutOfRange(query, catalog.total)) notFound();

  return (
    <main className="catalog-page" id="main-content">
      <JsonLdSchema
        data={buildCollectionPageSchema({
          name: page?.h1 || page?.title || "Каталог продукции John Deere",
          url: absoluteUrl("/catalog"),
          description: page?.intro,
        })}
      />
      <JsonLdSchema
        data={buildBreadcrumbSchema([
          { name: "Главная", url: absoluteUrl("/") },
          { name: "Каталог", url: absoluteUrl("/catalog") },
        ])}
      />
      <Container>
        <Breadcrumbs
          items={[{ href: "/", label: "Главная" }, { label: "Каталог" }]}
        />
        <header className="catalog-heading">
          {page?.eyebrow ? (
            <p className="catalog-heading__eyebrow">{page.eyebrow}</p>
          ) : null}
          <h1>{page?.h1 || "Каталог продукции John Deere"}</h1>
          <p>
            {page?.intro ??
              "Найдите товар по названию или артикулу. Для проверки совместимости и условий поставки отправьте заявку на консультацию."}
          </p>
        </header>
        <Suspense fallback={<div className="catalog-controls-skeleton" />}>
          <CatalogControls categories={categories} />
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
          pathname="/catalog"
          searchParams={rawSearchParams}
          total={catalog.total}
        />
      </Container>
    </main>
  );
}