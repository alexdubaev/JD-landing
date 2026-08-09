import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { CatalogSearchParams } from "@/lib/catalog/search-params";

const pageHref = (
  pathname: string,
  searchParams: CatalogSearchParams,
  page: number,
) => {
  const query = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  return `${pathname}${query.size ? `?${query.toString()}` : ""}`;
};

export function Pagination({
  currentPage,
  pageSize,
  pathname,
  searchParams,
  total,
}: {
  currentPage: number;
  pageSize: number;
  pathname: string;
  searchParams: CatalogSearchParams;
  total: number;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Страницы каталога" className="catalog-pagination">
      {currentPage > 1 ? (
        <Link href={pageHref(pathname, searchParams, currentPage - 1)}>
          <ChevronLeft aria-hidden="true" />
          Назад
        </Link>
      ) : (
        <span aria-disabled="true">
          <ChevronLeft aria-hidden="true" />
          Назад
        </span>
      )}
      <span>
        Страница {currentPage} из {totalPages}
      </span>
      {currentPage < totalPages ? (
        <Link href={pageHref(pathname, searchParams, currentPage + 1)}>
          Вперёд
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span aria-disabled="true">
          Вперёд
          <ChevronRight aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
