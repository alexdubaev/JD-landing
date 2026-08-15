"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useState } from "react";

import { directusAssetUrl } from "@/lib/directus/assets";
import type { ProductImageItem } from "@/types/catalog";

export function ProductGallery({
  imageAlt,
  images,
}: {
  imageAlt: string;
  images: ProductImageItem[];
}) {
  const uniqueItems = [
    ...new Map(
      images.filter(({ imageId }) => Boolean(imageId)).map((item) => [item.imageId, item]),
    ).values(),
  ];
  const [activeId, setActiveId] = useState(uniqueItems[0]?.imageId ?? null);
  const reduceMotion = useReducedMotion();

  if (!activeId) {
    return (
      <div className="product-gallery__empty">
        <Image
          alt={imageAlt}
          className="product-gallery__fallback-image"
          fill
          priority
          sizes="(max-width: 52rem) 100vw, 50vw"
          src="/images/catalog/product-placeholder-industrial.webp"
        />
      </div>
    );
  }

  const activeItem = uniqueItems.find(({ imageId }) => imageId === activeId);
  // A canonical product_images row may carry its own alt_text; the legacy
  // gallery fallback maps every reference without one, so the product-level
  // alt stays the fallback.
  const activeAlt = activeItem?.alt || imageAlt;
  const activeUrl = directusAssetUrl(activeId, {
    width: 1200,
    height: 900,
    fit: "contain",
    quality: 86,
    format: "webp",
  });

  return (
    <div className="product-gallery">
      <div className="product-gallery__main">
        <AnimatePresence mode="wait">
          {activeUrl ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="product-gallery__frame"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={activeId}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <Image
                alt={activeAlt}
                fill
                priority
                sizes="(max-width: 52rem) 100vw, 50vw"
                src={activeUrl}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {uniqueItems.length > 1 ? (
        <div aria-label="Галерея товара" className="product-gallery__thumbs">
          {uniqueItems.map(({ imageId }, index) => {
            const thumbnail = directusAssetUrl(imageId, {
              width: 180,
              height: 135,
              fit: "contain",
              quality: 72,
              format: "webp",
            });
            return (
              <button
                aria-label={`Показать изображение ${index + 1}`}
                aria-pressed={imageId === activeId}
                key={imageId}
                onClick={() => setActiveId(imageId)}
                type="button"
              >
                {thumbnail ? (
                  <Image
                    alt=""
                    fill
                    sizes="5rem"
                    src={thumbnail}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
