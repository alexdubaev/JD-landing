"use client";

import { ImageOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useState } from "react";

import { directusAssetUrl } from "@/lib/directus/assets";

export function ProductGallery({
  imageAlt,
  imageIds,
}: {
  imageAlt: string;
  imageIds: string[];
}) {
  const uniqueIds = [...new Set(imageIds.filter(Boolean))];
  const [activeId, setActiveId] = useState(uniqueIds[0] ?? null);
  const reduceMotion = useReducedMotion();

  if (!activeId) {
    return (
      <div
        aria-label="Изображение товара пока не добавлено"
        className="product-gallery__empty"
        role="img"
      >
        <ImageOff aria-hidden="true" />
        <span>Фото товара готовится</span>
      </div>
    );
  }

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
                alt={imageAlt}
                fill
                priority
                sizes="(max-width: 52rem) 100vw, 50vw"
                src={activeUrl}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {uniqueIds.length > 1 ? (
        <div aria-label="Галерея товара" className="product-gallery__thumbs">
          {uniqueIds.map((id, index) => {
            const thumbnail = directusAssetUrl(id, {
              width: 180,
              height: 135,
              fit: "contain",
              quality: 72,
              format: "webp",
            });
            return (
              <button
                aria-label={`Показать изображение ${index + 1}`}
                aria-pressed={id === activeId}
                key={id}
                onClick={() => setActiveId(id)}
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
