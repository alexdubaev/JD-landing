import { SearchX } from "lucide-react";
import Link from "next/link";

export function EmptyCatalog() {
  return (
    <div className="catalog-empty">
      <SearchX aria-hidden="true" />
      <h2>Товары не найдены</h2>
      <p>
        Измените поисковый запрос или сбросьте фильтры. Мы также можем подобрать
        нужную позицию по описанию задачи.
      </p>
      <Link className="button button--secondary" href="/catalog">
        Сбросить фильтры
      </Link>
    </div>
  );
}
