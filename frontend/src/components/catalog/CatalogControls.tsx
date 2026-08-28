"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/ui/Modal";
import {
  AVAILABILITY_FILTERS,
  PART_TYPE_FILTERS,
  PRICE_FILTERS,
  type CatalogFilterOption,
} from "@/lib/format/catalog-labels";
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const replaceParameter = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams.toString());
    for (const name of ["q", "category", "availability", "price", "part_type", "page"]) {
      next.delete(name);
    }
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    replaceParameter("q", String(form.get("q") ?? "").trim());
  };

  const filters = (
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
          {AVAILABILITY_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.optionLabel}
            </option>
          ))}
        </select>
      </label>
      <label>
        Цена
        <select
          defaultValue={searchParams.get("price") ?? ""}
          onChange={(event) => replaceParameter("price", event.target.value)}
        >
          <option value="">Любая</option>
          {PRICE_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.optionLabel}
            </option>
          ))}
        </select>
      </label>
      <label>
        Тип детали
        <select
          defaultValue={searchParams.get("part_type") ?? ""}
          onChange={(event) =>
            replaceParameter("part_type", event.target.value)
          }
        >
          <option value="">Любой</option>
          {PART_TYPE_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.optionLabel}
            </option>
          ))}
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
  );
  const activeCategory = categories?.find(
    (category) => category.slug === searchParams.get("category"),
  );
  const activeFilterChip = (
    filters: CatalogFilterOption[],
    param: string,
  ): { key: string; label: string } | null => {
    const value = searchParams.get(param);
    const match = filters.find((filter) => filter.value === value);
    return match ? { key: param, label: match.chipLabel } : null;
  };
  const activeFilters = [
    searchParams.get("q")
      ? { key: "q", label: `Поиск: ${searchParams.get("q")}` }
      : null,
    activeCategory
      ? { key: "category", label: `Категория: ${activeCategory.title}` }
      : null,
    activeFilterChip(AVAILABILITY_FILTERS, "availability"),
    activeFilterChip(PRICE_FILTERS, "price"),
    activeFilterChip(PART_TYPE_FILTERS, "part_type"),
  ].filter((item): item is { key: string; label: string } => item !== null);

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
      <button
        aria-label="Открыть фильтры"
        className="catalog-filter-trigger"
        onClick={() => setFiltersOpen(true)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" />
        Фильтры
        {activeFilters.length ? <span>{activeFilters.length}</span> : null}
      </button>
      <div className="catalog-filters-desktop">{filters}</div>
      <div aria-label="Активные фильтры" className="catalog-filter-chips">
        {activeFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => replaceParameter(filter.key, "")}
            type="button"
          >
            {filter.label}
            <X aria-hidden="true" />
          </button>
        ))}
        {activeFilters.length > 1 ? (
          <button
            className="catalog-filter-chips__clear"
            onClick={clearFilters}
            type="button"
          >
            Сбросить все
          </button>
        ) : null}
      </div>
      <Modal
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Фильтры каталога"
      >
        {filters}
      </Modal>
    </div>
  );
}
