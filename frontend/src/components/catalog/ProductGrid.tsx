import type { ProductCardData } from "@/types/catalog";

import { ProductCard } from "./ProductCard";

export function ProductGrid({
  headingLevel = 2,
  products,
}: {
  headingLevel?: 2 | 3;
  products: ProductCardData[];
}) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          headingLevel={headingLevel}
          key={product.id}
          product={product}
        />
      ))}
    </div>
  );
}
