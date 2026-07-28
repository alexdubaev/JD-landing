import { CheckCircle2, FileText, Search, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

export function HomeHero() {
  return (
    <section className="commerce-hero" aria-labelledby="home-title">
      <Image
        alt="Сельскохозяйственная техника в поле"
        className="commerce-hero__image"
        fill
        priority
        sizes="100vw"
        src="/images/home/hero-machinery-v1.webp"
      />
      <div className="commerce-hero__veil" />
      <Container className="commerce-hero__content">
        <p className="commerce-hero__eyebrow">СМ ТЕХНО · каталог комплектующих</p>
        <h1 id="home-title">
          Запчасти и комплектующие для техники <span>John Deere</span>
        </h1>
        <p>
          Подберём позицию по артикулу, модели техники или описанию узла.
          Проверим совместимость и уточним условия поставки.
        </p>
        <div className="commerce-hero__actions">
          <Link className="button button--primary" href="/catalog">
            Перейти в каталог
          </Link>
          <Link className="button button--light" href="/contacts#consultation">
            Нужна помощь с подбором
          </Link>
        </div>
        <small>
          СМ ТЕХНО не заявляет статус официального представителя John Deere.
        </small>
      </Container>
      <Container className="hero-tools">
        <form
          action="/catalog"
          aria-label="Поиск по каталогу"
          className="hero-tool hero-tool--search"
          role="search"
        >
          <div className="hero-tool__title">
            <Search aria-hidden="true" />
            <div>
              <h2>Поиск по артикулу</h2>
              <p>Введите номер детали или название</p>
            </div>
          </div>
          <div className="hero-tool__field">
            <label className="visually-hidden" htmlFor="hero-search">
              Артикул или название товара
            </label>
            <input
              id="hero-search"
              name="q"
              placeholder="Например: RE57934"
              type="search"
            />
            <button type="submit">Найти</button>
          </div>
          <span className="hero-tool__hint">
            <CheckCircle2 aria-hidden="true" />
            Сверим запрос с каталогом перед предложением
          </span>
        </form>
        <form
          action="/contacts"
          className="hero-tool hero-tool--request"
          id="consultation"
        >
          <div className="hero-tool__title">
            <FileText aria-hidden="true" />
            <div>
              <h2>Есть список позиций?</h2>
              <p>Отправьте артикулы одним запросом</p>
            </div>
          </div>
          <div className="hero-tool__field">
            <label className="visually-hidden" htmlFor="parts-request">
              Список артикулов
            </label>
            <input
              id="parts-request"
              name="parts"
              placeholder="RE57934, AL150675…"
            />
            <button className="hero-tool__send" type="submit">
              <Send aria-hidden="true" />
              Отправить
            </button>
          </div>
          <span className="hero-tool__hint">
            Можно указать несколько артикулов через запятую
          </span>
        </form>
      </Container>
    </section>
  );
}
