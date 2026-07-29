import { ArrowRight, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { Reveal } from "@/components/motion/Reveal";
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
        <Reveal className="home-section__heading">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Категории запчастей"}</h2>
          </div>
          <Link href={section.buttonUrl ?? "/catalog"}>
            {section.buttonText ?? "Смотреть весь каталог"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>
        <div
          aria-label={section.title ?? "Категории запчастей"}
          className="home-categories__grid"
        >
          {categories.map((category) => {
            const imageUrl = directusAssetUrl(category.imageId, {
              width: 640,
              height: 480,
              fit: "cover",
              quality: 82,
              format: "webp",
            });

            return (
              <InteractiveCard key={category.id}>
                  <article
                    className={`home-category${imageUrl ? "" : " home-category--text-only"}`}
                  >
                    <Link
                      aria-label={`${category.title} — перейти в каталог`}
                      href={`/catalog/${category.slug}`}
                    >
                      <div className="home-category__media">
                        {imageUrl ? (
                          <Image
                            alt={category.imageAlt ?? category.title}
                            fill
                            sizes="(max-width: 40rem) 100vw, (max-width: 70rem) 33vw, 20vw"
                            src={imageUrl}
                          />
                        ) : (
                          <span className="home-category__placeholder">
                            <ImageOff aria-hidden="true" />
                          </span>
                        )}
                      </div>
                      <div className="home-category__content">
                        <h3>{category.title}</h3>
                        {category.description ? (
                          <p>{category.description}</p>
                        ) : null}
                        <span>
                          Открыть
                          <ArrowRight aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </article>
              </InteractiveCard>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
