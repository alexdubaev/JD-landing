"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import type { ProductCardData } from "@/types/catalog";

const productUrl = (product: ProductCardData) =>
  product.category
    ? `/catalog/${product.category.slug}/${product.slug}`
    : `/catalog?q=${encodeURIComponent(product.sku)}`;

export function HeroPartSearch({
  products,
}: {
  products: ProductCardData[];
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const suggestions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    if (needle.length < 2) return [];

    return products
      .filter(
        (product) =>
          product.sku.toLocaleLowerCase("ru").includes(needle) ||
          product.title.toLocaleLowerCase("ru").includes(needle),
      )
      .slice(0, 4);
  }, [products, query]);

  const selectSuggestion = (product: ProductCardData) => {
    setQuery(product.sku);
    setActiveIndex(-1);
    setIsOpen(false);
  };

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
              selectSuggestion(suggestions[activeIndex]);
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
            <button
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "is-active" : undefined}
              key={product.id}
              onClick={() => selectSuggestion(product)}
              role="option"
              type="button"
            >
              <strong>{product.sku}</strong>
              <span>{product.title}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="hero-part-search__examples">
        <span>Например:</span>
        {products.slice(0, 3).map((product) => (
          <Link href={productUrl(product)} key={product.id}>
            {product.sku}
          </Link>
        ))}
      </div>
    </div>
  );
}
