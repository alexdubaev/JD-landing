import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { ProductCardData } from "@/types/catalog";
import type { PageSection } from "@/types/content";

export function HomeFeatured({
  products,
  section,
}: {
  products: ProductCardData[];
  section: PageSection;
}) {
  if (!products.length) return null;

  return (
    <section className="home-section home-featured">
      <Container>
        <Reveal className="home-section__heading">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Избранные товары"}</h2>
          </div>
          <Link href={section.buttonUrl ?? "/catalog"}>
            {section.buttonText ?? "Весь каталог"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>
        <ProductGrid headingLevel={3} products={products} />
      </Container>
    </section>
  );
}
