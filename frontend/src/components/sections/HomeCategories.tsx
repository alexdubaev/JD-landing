import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

const categories = [
  {
    title: "Двигатель",
    text: "Компоненты и детали двигателя",
    image: "/images/home/category-engine-v1.webp",
  },
  {
    title: "Гидравлика",
    text: "Насосы, клапаны и соединения",
    image: "/images/home/category-hydraulics-v1.webp",
  },
  {
    title: "Трансмиссия",
    text: "Редукторы, валы и элементы привода",
    image: "/images/home/category-transmission-v1.webp",
  },
  {
    title: "Фильтры",
    text: "Фильтры для обслуживания техники",
    image: "/images/home/category-filters-v1.webp",
  },
  {
    title: "Электрика",
    text: "Стартеры, генераторы и компоненты",
    image: "/images/home/category-electrics-v1.webp",
  },
  {
    title: "Крепёж",
    text: "Болты, гайки и монтажные элементы",
    image: "/images/home/category-fasteners-v1.webp",
  },
];

export function HomeCategories() {
  return (
    <section className="home-section home-categories">
      <Container>
        <div className="home-section__heading">
          <div>
            <p>Основные направления</p>
            <h2>Категории запчастей</h2>
          </div>
          <Link href="/catalog">
            Смотреть весь каталог
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="home-categories__grid">
          {categories.map((category) => (
            <article className="home-category" key={category.title}>
              <Link
                aria-label={`${category.title} — перейти в каталог`}
                href="/catalog"
              >
                <div className="home-category__media">
                  <Image
                    alt=""
                    fill
                    sizes="(max-width: 40rem) 50vw, (max-width: 70rem) 33vw, 16vw"
                    src={category.image}
                  />
                </div>
                <div className="home-category__content">
                  <h3>{category.title}</h3>
                  <p>{category.text}</p>
                  <span>
                    Открыть
                    <ArrowRight aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
        <p className="home-categories__notice">
          Категории показаны как макет структуры и будут заменены актуальными
          данными из Directus.
        </p>
      </Container>
    </section>
  );
}
