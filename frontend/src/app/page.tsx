import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="home-eyebrow">Техника и комплектующие</p>
        <h1 id="home-title">Каталог продукции John Deere</h1>
        <p className="home-summary">
          Подбор запчастей и решений под задачи вашей техники. Проверим
          совместимость, уточним условия поставки и подготовим предложение.
        </p>
        <div className="home-actions">
          <Link className="primary-action" href="/catalog">
            Перейти в каталог
          </Link>
          <a className="secondary-action" href="#consultation">
            Оставить заявку
          </a>
        </div>
        <p className="home-disclaimer">
          Независимый каталог. Статус официального представителя не заявляется.
        </p>
      </section>
    </main>
  );
}
