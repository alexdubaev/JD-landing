import type { ProductCardData } from "@/types/catalog";

import { ProductCard } from "./ProductCard";

export function ProductGrid({
  headingLevel = 2,
  products,
  variant = "catalog",
}: {
  headingLevel?: 2 | 3;
  products: ProductCardData[];
  variant?: "homepage" | "catalog";
}) {
  return (
    <div className={`product-grid product-grid--${variant}`}>
      {products.map((product) => (
        <ProductCard
          headingLevel={headingLevel}
          key={product.id}
          product={product}
          variant={variant}
        />
      ))}
    </div>
  );
}
