"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import type { ProductCardData } from "@/types/catalog";

const productUrl = (product: ProductCardData) =>
  product.category
    ? `/catalog/${product.category.slug}/${product.slug}`
    : `/catalog?q=${encodeURIComponent(product.sku)}`;

export const normalizePartQuery = (value: string) =>
  value.trim().replace(/[\s-]+/gu, "").toLocaleLowerCase("ru");

export function HeroPartSearch({
}: Record<string, never>) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ProductCardData[]>([]);

  useEffect(() => {
    const needle = normalizePartQuery(query);
    if (needle.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/suggestions?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { items?: ProductCardData[] };
        setSuggestions(Array.isArray(payload.items) ? payload.items.slice(0, 6) : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSuggestions([]);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  return (
    <div className="hero-part-search">
      <form
        action="/catalog"
        aria-label="Поиск по каталогу"
        className="hero-part-search__form"
        role="search"
      >
        <Search aria-hidden="true" />
        <label className="visually-hidden" htmlFor="hero-part-search">
          Артикул детали
        </label>
        <input
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          aria-controls={listboxId}
          aria-expanded={isOpen && suggestions.length > 0}
          autoComplete="off"
          id="hero-part-search"
          name="q"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
              return;
            }
            if (!suggestions.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) =>
                current >= suggestions.length - 1 ? 0 : current + 1,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) =>
                current <= 0 ? suggestions.length - 1 : current - 1,
              );
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              document
                .getElementById(`${listboxId}-option-${activeIndex}`)
                ?.click();
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Введите артикул детали"
          role="combobox"
          type="search"
          value={query}
        />
        <button disabled={!query.trim()} type="submit">
          Найти
        </button>
      </form>

      {isOpen && suggestions.length > 0 ? (
        <div
          aria-label="Подсказки товаров"
          className="hero-part-search__suggestions"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((product, index) => (
            <Link
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "is-active" : undefined}
              href={productUrl(product)}
              id={`${listboxId}-option-${index}`}
              key={product.id}
              onClick={() => setIsOpen(false)}
              role="option"
            >
              <strong>{product.sku}</strong>
              <span>{product.title}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="hero-part-search__scenarios">
        <span>Нужно проверить несколько позиций?</span>
        <div>
          <Link href="#parts-request">Вставить список</Link>
          <Link href="#parts-request">Загрузить Excel</Link>
          <Link href="#parts-request">Отправить фото</Link>
        </div>
      </div>
    </div>
  );
}
