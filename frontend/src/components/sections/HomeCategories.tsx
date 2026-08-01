"use client";

import { ArrowRight, PackageSearch } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import { trackEvent } from "@/lib/analytics";
import type { Category } from "@/types/catalog";
import type { PageSection } from "@/types/content";

export const getHomepageCategories = (categories: Category[]) =>
  categories.reduce<Category[]>((result, category) => {
    const identity = `${category.title} ${category.slug}`.toLocaleLowerCase("ru");
    const isMisc = /(?:^|\s)(?:прочее|other|misc)(?:\s|$)/iu.test(identity);
    const isDuplicate = result.some(
      (item) => item.id === category.id || item.slug === category.slug,
    );

    if (result.length < 11 && !isMisc && !isDuplicate) result.push(category);
    return result;
  }, []);

export function HomeCategories({
  categories,
  section,
}: {
  categories: Category[];
  section: PageSection;
}) {
  const curatedCategories = getHomepageCategories(categories);
  if (!curatedCategories.length) return null;

  return (
    <section className="home-section home-categories">
      <Container>
        <div className="home-section__heading">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Категории продукции"}</h2>
          </div>
          <Link href={section.buttonUrl ?? "/catalog"}>
            Смотреть все категории
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div
          aria-label={section.title ?? "Категории продукции"}
          className="home-categories__grid"
        >
          {curatedCategories.map((category) => {
            const image = directusAssetUrl(category.imageId ?? category.iconId ?? null, {
              width: 96,
              height: 96,
              fit: "cover",
              quality: 88,
              format: "webp",
            });
            return (
              <article
                className={`home-category${image ? "" : " home-category--text-only"}`}
                key={category.id}
              >
                <Link
                  aria-label={`${category.title} — перейти в каталог`}
                  href={`/catalog/${category.slug}`}
                  onClick={() => trackEvent("category_view", { category_id: category.id })}
                >
                  <span className="home-category__media">
                    {image ? (
                      <Image
                        alt={category.imageAlt ?? category.iconAlt ?? category.title}
                        fill
                        sizes="(max-width: 48rem) 36px, 40px"
                        src={image}
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
