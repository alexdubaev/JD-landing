import type { Metadata } from "next";
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
  getCategories,
  getPageSeoBySlug,
} from "@/lib/directus/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageSeoBySlug("catalog");
  if (!page) return { title: "Каталог продукции" };
  const image = directusAssetUrl(page.ogImageId, { width: 1200, height: 630 });

  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    alternates: page.canonicalUrl ? { canonical: page.canonicalUrl } : undefined,
    robots: page.isIndexable ? undefined : { index: false, follow: false },
    openGraph: image ? { images: [image] } : undefined,
  };
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

  return (
    <main className="catalog-page" id="main-content">
      <Container>
        <Breadcrumbs
          items={[{ href: "/", label: "Главная" }, { label: "Каталог" }]}
        />
        <header className="catalog-heading">
          <p className="catalog-heading__eyebrow">
            Техника и комплектующие
          </p>
          <h1>{page?.h1 || "Каталог продукции John Deere"}</h1>
          <p>
            Найдите товар по названию или артикулу. Для проверки совместимости
            и условий поставки отправьте заявку на консультацию.
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
