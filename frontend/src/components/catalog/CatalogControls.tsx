"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";

import type { Category } from "@/types/catalog";

export function CatalogControls({
  categories,
  categorySlug,
}: {
  categories?: Category[];
  categorySlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const replaceParameter = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    replaceParameter("q", String(form.get("q") ?? "").trim());
  };

  return (
    <div className="catalog-controls">
      <form className="catalog-search" onSubmit={submitSearch} role="search">
        <label htmlFor="catalog-search">Поиск по каталогу</label>
        <div className="catalog-search__field">
          <Search aria-hidden="true" />
          <input
            defaultValue={searchParams.get("q") ?? ""}
            id="catalog-search"
            maxLength={120}
            name="q"
            placeholder="Название или артикул"
            type="search"
          />
          <button type="submit">Найти</button>
        </div>
      </form>
      <div className="catalog-filters">
        {categories && !categorySlug ? (
          <label>
            Категория
            <select
              defaultValue={searchParams.get("category") ?? ""}
              onChange={(event) =>
                replaceParameter("category", event.target.value)
              }
            >
              <option value="">Все категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Наличие
          <select
            defaultValue={searchParams.get("availability") ?? ""}
            onChange={(event) =>
              replaceParameter("availability", event.target.value)
            }
          >
            <option value="">Любое</option>
            <option value="in_stock">В наличии</option>
            <option value="on_request">Под заказ</option>
            <option value="out_of_stock">Нет в наличии</option>
          </select>
        </label>
        <label>
          Цена
          <select
            defaultValue={searchParams.get("price") ?? ""}
            onChange={(event) => replaceParameter("price", event.target.value)}
          >
            <option value="">Любая</option>
            <option value="fixed">Указана</option>
            <option value="on_request">По запросу</option>
          </select>
        </label>
        <label>
          Сортировка
          <select
            defaultValue={searchParams.get("sort") ?? "relevance"}
            onChange={(event) => replaceParameter("sort", event.target.value)}
          >
            <option value="relevance">По популярности</option>
            <option value="title_asc">По названию</option>
            <option value="price_asc">Сначала дешевле</option>
            <option value="price_desc">Сначала дороже</option>
          </select>
        </label>
      </div>
    </div>
  );
}
