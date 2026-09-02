"use client";

import { ArrowRight, ListPlus, ShoppingCart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { isPurchasable, useCart } from "@/lib/cart/context";
import { directusAssetUrl } from "@/lib/directus/assets";
import { trackEvent } from "@/lib/analytics";
import { AVAILABILITY_LABELS } from "@/lib/format/catalog-labels";
import { formatProductPrice } from "@/lib/format/price";
import {
  getProductRequestList,
  PRODUCT_REQUEST_LIST_EVENT,
  toggleProductRequestItem,
} from "@/lib/leads/product-request-list";
import type { ProductCardData } from "@/types/catalog";

const partTypeLabels = {
  analog: "Аналог",
  oem: "OEM",
  original: "Оригинал",
} as const;

export function ProductCard({
  headingLevel = 2,
  product,
  variant = "catalog",
}: {
  headingLevel?: 2 | 3;
  product: ProductCardData;
  variant?: "homepage" | "catalog";
}) {
  const [inRequest, setInRequest] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const { addToCart, has: hasInCart, quantityOf } = useCart();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const purchasable = isPurchasable(product);
  const inCart = hasInCart(product.id);
  const cartQty = quantityOf(product.id);
  const imageUrl = directusAssetUrl(product.mainImageId, {
    width: 720,
    height: 450,
    fit: "cover",
    quality: 82,
    format: "webp",
  });
  const productUrl = product.category
    ? `/catalog/${product.category.slug}/${product.slug}`
    : "/contacts#consultation";

  useEffect(() => {
    const sync = () => {
      const items = getProductRequestList();
      setInRequest(items.some((item) => item.id === product.id));
      setRequestCount(items.length);
    };
    sync();
    window.addEventListener(PRODUCT_REQUEST_LIST_EVENT, sync);
    return () => window.removeEventListener(PRODUCT_REQUEST_LIST_EVENT, sync);
  }, [product.id]);

  const toggleRequest = () => {
    const next = toggleProductRequestItem({
      id: product.id,
      sku: product.sku,
      title: product.title,
    });
    setInRequest(next);
    setRequestCount(getProductRequestList().length);
    if (next) trackEvent("product_add_to_request", { product_id: product.id });
  };

  const handleAddToCart = () => {
    addToCart(product, 1);
    trackEvent("product_add_to_cart", { product_id: product.id });
  };

  return (
    <InteractiveCard className="product-card-motion">
      <article className={`product-card product-card--${variant}`}>
      <div className="product-card__media">
        {imageUrl ? (
          <Image
            alt={product.imageAlt || product.title}
            fill
            sizes="(max-width: 40rem) 100vw, (max-width: 72rem) 50vw, 25vw"
            src={imageUrl}
          />
        ) : (
          <Image
            alt={product.imageAlt || product.title}
            className="product-card__fallback-image"
            fill
            sizes="(max-width: 40rem) 100vw, (max-width: 72rem) 50vw, 25vw"
            src="/images/catalog/product-placeholder-industrial.webp"
          />
        )}
      </div>
      <div className="product-card__body">
        {product.category ? (
          <Link
            className="product-card__category"
            href={`/catalog/${product.category.slug}`}
            onClick={() => trackEvent("category_view", { category_id: product.category?.id ?? "" })}
          >
            {product.category.title}
          </Link>
        ) : (
          <span className="product-card__category">Без категории</span>
        )}
        <div className="product-card__facts" data-testid="product-card-facts">
          <Heading className="product-card__title">
            <Link href={productUrl} onClick={() => trackEvent("product_open", { product_id: product.id })}>{product.title}</Link>
          </Heading>
          <p className="product-card__sku">Артикул: {product.sku}</p>
          {product.brand || product.partType ? (
            <div className="product-card__metadata">
              {product.brand ? <span>{product.brand}</span> : null}
              {product.partType ? <span>{partTypeLabels[product.partType]}</span> : null}
            </div>
          ) : null}
          {variant === "catalog" && product.shortDescription ? (
            <p className="product-card__description">
              {product.shortDescription}
            </p>
          ) : null}
          <div className="product-card__commercial">
            <strong className="product-card__price">{formatProductPrice(product)}</strong>
            {product.availabilityStatus !== "on_request" ? (
              <span
                className={`product-card__availability product-card__availability--${product.availabilityStatus}`}
              >
                {AVAILABILITY_LABELS[product.availabilityStatus]}
              </span>
            ) : null}
            {product.deliveryStatus ? (
              <span className="product-card__delivery">{product.deliveryStatus}</span>
            ) : null}
          </div>
          <div className="product-card__actions">
            <Link className="product-card__action" href={productUrl} onClick={() => trackEvent("product_open", { product_id: product.id })}>
              Подробнее
              <ArrowRight
                aria-hidden="true"
                data-testid="product-card-action-arrow"
              />
            </Link>
            {purchasable ? (
              <button
                aria-label={inCart ? `В корзине: ${cartQty} шт.` : "В корзину"}
                className={`product-card__cart${inCart ? " product-card__cart--active" : ""}`}
                onClick={handleAddToCart}
                type="button"
              >
                <ShoppingCart aria-hidden="true" />
                {inCart ? `В корзине: ${cartQty}` : "В корзину"}
              </button>
            ) : null}
            <button
              aria-label={inRequest ? "Убрать из запроса" : "В запрос"}
              className="product-card__request"
              onClick={toggleRequest}
              type="button"
            >
              <ListPlus aria-hidden="true" />
              {inRequest ? "В запросе" : "В запрос"}
            </button>
            {requestCount ? (
              <Link
                aria-label={`Перейти к списку запроса: ${requestCount} поз.`}
                className="product-card__request-summary"
                href="/parts-request"
              >
                В списке: {requestCount}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      </article>
    </InteractiveCard>
  );
}
