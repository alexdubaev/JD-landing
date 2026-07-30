import { ArrowRight, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { InteractiveCard } from "@/components/motion/InteractiveCard";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { ProductCardData } from "@/types/catalog";

const availabilityLabels: Record<
  ProductCardData["availabilityStatus"],
  string
> = {
  in_stock: "В наличии",
  on_request: "Под заказ",
  out_of_stock: "Нет в наличии",
};

const formatPrice = (product: ProductCardData) => {
  if (product.priceStatus === "on_request") return "Цена по запросу";
  if (product.priceStatus === "hidden" || product.price == null) {
    return "Уточнить условия";
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: product.currency,
    maximumFractionDigits: 0,
  }).format(product.price);
};

export function ProductCard({
  headingLevel = 2,
  product,
  variant = "catalog",
}: {
  headingLevel?: 2 | 3;
  product: ProductCardData;
  variant?: "homepage" | "catalog";
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
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
          <div
            aria-label="Изображение товара пока не добавлено"
            className="product-card__placeholder"
            role="img"
          >
            <ImageOff aria-hidden="true" />
            <span>Фото готовится</span>
          </div>
        )}
      </div>
      <div className="product-card__body">
        {product.category ? (
          <Link
            className="product-card__category"
            href={`/catalog/${product.category.slug}`}
          >
            {product.category.title}
          </Link>
        ) : (
          <span className="product-card__category">Без категории</span>
        )}
        <Heading className="product-card__title">
          <Link href={productUrl}>{product.title}</Link>
        </Heading>
        <p className="product-card__sku">Артикул: {product.sku}</p>
        {variant === "catalog" && product.shortDescription ? (
          <p className="product-card__description">
            {product.shortDescription}
          </p>
        ) : null}
        <div className="product-card__commercial">
          <strong className="product-card__price">{formatPrice(product)}</strong>
          <span
            className={`product-card__availability product-card__availability--${product.availabilityStatus}`}
          >
            {availabilityLabels[product.availabilityStatus]}
          </span>
        </div>
        <Link className="product-card__action" href={productUrl}>
          {product.category ? "Подробнее" : "Запросить консультацию"}
          <ArrowRight
            aria-hidden="true"
            data-testid="product-card-action-arrow"
          />
        </Link>
      </div>
      </article>
    </InteractiveCard>
  );
}
