import type { ProductCardData } from "@/types/catalog";

import { ProductGrid } from "./ProductGrid";

export function RelatedProducts({
  products,
}: {
  products: ProductCardData[];
}) {
  if (!products.length) return null;

  return (
    <section className="product-section" aria-labelledby="related-title">
      <h2 id="related-title">Похожие товары</h2>
      <ProductGrid headingLevel={3} products={products} />
    </section>
  );
}
