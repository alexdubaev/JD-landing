import { ArrowRight, PackageSearch } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { Category } from "@/types/catalog";
import type { PageSection } from "@/types/content";

export function HomeCategories({
  categories,
  section,
}: {
  categories: Category[];
  section: PageSection;
}) {
  if (!categories.length) return null;

  return (
    <section className="home-section home-categories">
      <Container>
        <div className="home-section__heading">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Категории продукции"}</h2>
          </div>
          <Link href={section.buttonUrl ?? "/catalog"}>
            {section.buttonText ?? "Весь каталог"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div
          aria-label={section.title ?? "Категории продукции"}
          className="home-categories__grid"
        >
          {categories.slice(0, 12).map((category) => {
            const icon = directusAssetUrl(category.iconId ?? null, {
              width: 96,
              height: 96,
              fit: "cover",
              quality: 88,
              format: "webp",
            });
            return (
              <article
                className={`home-category${icon ? "" : " home-category--text-only"}`}
                key={category.id}
              >
                <Link
                  aria-label={`${category.title} — перейти в каталог`}
                  href={`/catalog/${category.slug}`}
                >
                  <span className="home-category__media">
                    {icon ? (
                      <Image
                        alt={category.iconAlt ?? category.title}
                        fill
                        sizes="40px"
                        src={icon}
                      />
                    ) : (
                      <PackageSearch aria-hidden="true" />
                    )}
                  </span>
                  <h3>{category.title}</h3>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
