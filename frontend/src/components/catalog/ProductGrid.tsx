import type { ProductCardData } from "@/types/catalog";

import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
