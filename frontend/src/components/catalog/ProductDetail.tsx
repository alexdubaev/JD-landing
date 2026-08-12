import Link from "next/link";

import type { Product, PublicFile } from "@/types/catalog";

import { AddToCartButton } from "./AddToCartButton";
import { ProductGallery } from "./ProductGallery";

const availabilityLabels: Record<Product["availabilityStatus"], string> = {
  in_stock: "В наличии",
  on_request: "Под заказ",
  out_of_stock: "Нет в наличии",
};

const productPrice = (product: Product) => {
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

export function ProductDetail({
  documents,
  product,
}: {
  documents: PublicFile[];
  product: Product;
}) {
  const imageIds = [
    ...(product.mainImageId ? [product.mainImageId] : []),
    ...product.galleryIds,
  ];
  const consultationUrl = new URLSearchParams({
    product: product.id,
    ...(product.category ? { category: product.category.id } : {}),
  });

  return (
    <>
      <div className="product-detail">
        <ProductGallery
          imageAlt={product.imageAlt || product.title}
          imageIds={imageIds}
        />
        <div className="product-detail__content">
          {product.category ? (
            <Link
              className="product-detail__category"
              href={`/catalog/${product.category.slug}`}
            >
              {product.category.title}
            </Link>
          ) : null}
          <h1>{product.title}</h1>
          <p className="product-detail__sku">Артикул: {product.sku}</p>
          {product.analogSkus.length ? (
            <p className="product-detail__analogs">
              Замены: {product.analogSkus.join(", ")}
            </p>
          ) : null}
          {product.shortDescription ? (
            <p className="product-detail__summary">
              {product.shortDescription}
            </p>
          ) : null}
          <div className="product-detail__commercial">
            <strong>{productPrice(product)}</strong>
            <span>{availabilityLabels[product.availabilityStatus]}</span>
          </div>
          <AddToCartButton product={product} />
          <Link
            className="button button--secondary product-detail__cta"
            href={`/contacts?${consultationUrl.toString()}#consultation`}
          >
            {product.ctaText || "Запросить консультацию"}
          </Link>
          <p className="product-detail__notice">
            Совместимость, комплектацию и условия поставки подтвердит менеджер.
            Для проверки укажите артикул, маркировку, модель техники или приложите
            фотографию детали.
          </p>
        </div>
      </div>
      {product.fullDescription ? (
        <section className="product-section" aria-labelledby="description-title">
          <h2 id="description-title">Описание</h2>
          <div className="product-section__text">{product.fullDescription}</div>
        </section>
      ) : null}
      {documents.length ? (
        <section className="product-section" aria-labelledby="documents-title">
          <h2 id="documents-title">Документы</h2>
          <ul className="product-documents">
            {documents.map((document) => (
              <li key={document.id}>
                <a
                  href={`/media/${encodeURIComponent(document.id)}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {document.title || document.filename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
