import type {
  ProductAnalogsView,
  ProductCardData,
  ProductRelationType,
} from "@/types/catalog";

import { ProductGrid } from "./ProductGrid";

/** Render order and RU titles of the symmetric relation groups (R8). */
const SYMMETRIC_GROUPS: {
  relationType: Exclude<ProductRelationType, "superseded_by">;
  title: string;
}[] = [
  { relationType: "analog", title: "Аналоги" },
  { relationType: "oem_cross", title: "Взаимозаменяемые артикулы (OEM-кросс)" },
  { relationType: "compatible", title: "Совместимые товары" },
];

export function RelatedProducts({
  products,
  analogs,
}: {
  /** Legacy `products.related_products` fallback cards. */
  products: ProductCardData[];
  /** Normalized `products_analogs` view of the current product (R8). */
  analogs?: ProductAnalogsView;
}) {
  const symmetricItems = analogs?.analogs ?? [];
  const supersededProducts = (analogs?.supersededBy ?? []).map(
    ({ product }) => product,
  );

  // R8 dual-read rule (the same rule as the R7A media dual-read): the
  // products_analogs view wins ONLY when it has at least one row — an EMPTY
  // view must never shadow non-empty legacy related_products.
  const hasAnalogs = symmetricItems.length > 0 || supersededProducts.length > 0;
  const legacyProducts = hasAnalogs ? [] : products;
  if (!hasAnalogs && legacyProducts.length === 0) return null;

  if (!hasAnalogs) {
    return (
      <section className="product-section" aria-labelledby="related-title">
        <h2 id="related-title">Похожие товары</h2>
        <ProductGrid headingLevel={3} products={legacyProducts} />
      </section>
    );
  }

  const groups = SYMMETRIC_GROUPS.map(({ relationType, title }) => ({
    key: relationType,
    title,
    products: symmetricItems
      .filter((item) => item.relationType === relationType)
      .map(({ product }) => product),
  })).filter((group) => group.products.length > 0);

  return (
    <>
      {supersededProducts.length > 0 ? (
        <section className="product-section" aria-labelledby="superseded-by-title">
          <h2 id="superseded-by-title">Этот артикул заменён</h2>
          <p className="product-section__note">
            Показанные ниже товары заменяют этот артикул. Совместимость и
            условия поставки уточнит специалист по вашему запросу.
          </p>
          <ProductGrid headingLevel={3} products={supersededProducts} />
        </section>
      ) : null}
      {groups.map((group) => (
        <section
          className="product-section"
          key={group.key}
          aria-labelledby={`related-${group.key}`}
        >
          <h2 id={`related-${group.key}`}>{group.title}</h2>
          <ProductGrid headingLevel={3} products={group.products} />
        </section>
      ))}
    </>
  );
}
