"use client";

import { ImageOff } from "lucide-react";
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
        {activeUrl ? (
          <Image
            alt={imageAlt}
            fill
            priority
            sizes="(max-width: 52rem) 100vw, 50vw"
            src={activeUrl}
          />
        ) : null}
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
