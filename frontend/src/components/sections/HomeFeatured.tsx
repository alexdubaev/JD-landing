import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { ProductCardData } from "@/types/catalog";
import type { PageSection } from "@/types/content";

const isCompleteHomepageProduct = (product: ProductCardData) =>
  Boolean(product.mainImageId) &&
  Boolean(product.title.trim()) &&
  Boolean(product.sku.trim()) &&
  product.priceStatus === "fixed" &&
  typeof product.price === "number" &&
  Number.isFinite(product.price) &&
  Boolean(product.deliveryStatus?.trim());

export function HomeFeatured({
  products,
  section,
}: {
  products: ProductCardData[];
  section: PageSection;
}) {
  const completeProducts = products.filter(isCompleteHomepageProduct).slice(0, 5);
  if (!completeProducts.length) return null;

  return (
    <section className="home-section home-featured">
      <Container>
        <Reveal className="home-section__heading">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Позиции каталога"}</h2>
          </div>
          <Link href={section.buttonUrl ?? "/catalog"}>
            {section.buttonText ?? "Весь каталог"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>
        <ProductGrid headingLevel={3} products={completeProducts} variant="homepage" />
      </Container>
    </section>
  );
}
