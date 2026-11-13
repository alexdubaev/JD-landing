import { SearchX } from "lucide-react";
import Link from "next/link";

import { LeadForm } from "@/components/forms/LeadForm";

export function EmptyCatalog({ search = "" }: { search?: string }) {
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
      <section aria-labelledby="empty-catalog-request">
        <h3 id="empty-catalog-request">Запросить подбор</h3>
        <LeadForm key={search} initialMessage={search ? `Помогите подобрать: ${search}` : ""} />
      </section>
    </div>
  );
}
