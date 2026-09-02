"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import type { ProductCardData } from "@/types/catalog";

type SearchLink = {
  text: string;
  url: string;
};

type HeroPartSearchProps = {
  label: string;
  placeholder: string;
  buttonText: string;
  bulkPrompt: string;
  bulkLink: SearchLink;
  excelLink: SearchLink;
  photoLink: SearchLink;
};

const productUrl = (product: ProductCardData) =>
  product.category
    ? `/catalog/${product.category.slug}/${product.slug}`
    : `/catalog?q=${encodeURIComponent(product.sku)}`;

export const normalizePartQuery = (value: string) =>
  value.trim().replace(/[\s-]+/gu, "").toLocaleLowerCase("ru");

export function HeroPartSearch({
  label,
  placeholder,
  buttonText,
  bulkPrompt,
  bulkLink,
  excelLink,
  photoLink,
}: HeroPartSearchProps) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ProductCardData[]>([]);

  useEffect(() => {
    const needle = normalizePartQuery(query);
    if (needle.length < 2) return;
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
        aria-label={label}
        className="hero-part-search__form"
        onSubmit={() => trackEvent("search_submit", { query_length: query.trim().length })}
        role="search"
      >
        <Search aria-hidden="true" />
        <label className="visually-hidden" htmlFor="hero-part-search">{label}</label>
        <input
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-controls={listboxId}
          aria-expanded={isOpen && suggestions.length > 0}
          autoComplete="off"
          id="hero-part-search"
          name="q"
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setActiveIndex(-1);
            if (normalizePartQuery(nextQuery).length < 2) {
              setSuggestions([]);
              setIsOpen(false);
            } else {
              setIsOpen(true);
            }
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
              setActiveIndex((current) => current >= suggestions.length - 1 ? 0 : current + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1);
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              document.getElementById(`${listboxId}-option-${activeIndex}`)?.click();
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          role="combobox"
          type="search"
          value={query}
        />
        <button disabled={!query.trim()} type="submit">{buttonText}</button>
      </form>

      {isOpen && suggestions.length > 0 ? (
        <div aria-label="Подсказки товаров" className="hero-part-search__suggestions" id={listboxId} role="listbox">
          {suggestions.map((product, index) => (
            <Link
              aria-selected={activeIndex === index}
              className={activeIndex === index ? "is-active" : undefined}
              href={productUrl(product)}
              id={`${listboxId}-option-${index}`}
              key={product.id}
              onClick={() => {
                setIsOpen(false);
                trackEvent("search_use", { source: "suggestion" });
              }}
              role="option"
            >
              <strong>{product.sku}</strong>
              <span>{product.title}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div
        aria-label="Способы отправить запрос"
        className="hero-part-search__scenarios"
        role="group"
      >
        <span>{bulkPrompt}</span>
        <div>
          <Link href={bulkLink.url} onClick={() => trackEvent("parts_request_cta", { method: "paste" })}>{bulkLink.text}</Link>
          <Link href={excelLink.url} onClick={() => trackEvent("parts_request_cta", { method: "excel" })}>{excelLink.text}</Link>
          <Link href={photoLink.url} onClick={() => trackEvent("parts_request_cta", { method: "photo" })}>{photoLink.text}</Link>
        </div>
      </div>
    </div>
  );
}
