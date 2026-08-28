import Link from "next/link";

import type { Product, ProductImageItem, PublicFile } from "@/types/catalog";

import { AVAILABILITY_LABELS } from "@/lib/format/catalog-labels";
import { formatProductPrice } from "@/lib/format/price";

import { AddToCartButton } from "./AddToCartButton";
import { ProductGallery } from "./ProductGallery";
import { ProductVerification } from "./ProductVerification";

export function ProductDetail({
  documents,
  product,
}: {
  documents: PublicFile[];
  product: Product;
}) {
  // Normalized dual-read view (R7A): canonical product_images rows when they
  // exist, otherwise the mapped legacy gallery references — both arrive as
  // ProductImageItem. The main image stays the gallery anchor.
  const galleryImages: ProductImageItem[] = [
    ...(product.mainImageId
      ? [{ imageId: product.mainImageId, alt: product.imageAlt }]
      : []),
    ...(product.images ?? []),
  ];
  // A canonical product_documents row may override the display title of the
  // attached file; legacy JSON references carry no override.
  const documentTitles = new Map(
    (product.documentItems ?? []).map((item) => [item.fileId, item.title]),
  );
  const consultationUrl = new URLSearchParams({
    product: product.id,
    ...(product.category ? { category: product.category.id } : {}),
  });

  return (
    <>
      <div className="product-detail">
        <ProductGallery
          imageAlt={product.imageAlt || product.title}
          images={galleryImages}
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
          {product.shortDescription ? (
            <p className="product-detail__summary">
              {product.shortDescription}
            </p>
          ) : null}
          <div className="product-detail__commercial">
            <strong>{formatProductPrice(product)}</strong>
            <span>{AVAILABILITY_LABELS[product.availabilityStatus]}</span>
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
      <ProductVerification product={product} />
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
                  {documentTitles.get(document.id) ||
                    document.title ||
                    document.filename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
