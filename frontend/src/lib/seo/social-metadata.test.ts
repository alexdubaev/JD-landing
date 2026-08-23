import { describe, expect, it } from "vitest";

import { buildSocialMetadata } from "./social-metadata";

describe("buildSocialMetadata", () => {
  it("builds page-specific Open Graph and Twitter metadata", () => {
    expect(
      buildSocialMetadata({
        title: "Каталог деталей",
        description: "Подбор деталей для техники John Deere.",
        path: "/catalog",
        type: "website",
        image: {
          url: "/uploads/catalog-og.jpg",
          alt: "Каталог деталей",
        },
      }),
    ).toEqual({
      openGraph: {
        title: "Каталог деталей",
        description: "Подбор деталей для техники John Deere.",
        url: "/catalog",
        type: "website",
        images: [{ url: "/uploads/catalog-og.jpg", alt: "Каталог деталей" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "Каталог деталей",
        description: "Подбор деталей для техники John Deere.",
        images: [{ url: "/uploads/catalog-og.jpg", alt: "Каталог деталей" }],
      },
    });
  });

  it("keeps social metadata valid when a page has no image", () => {
    const metadata = buildSocialMetadata({
      title: "Корзина",
      description: "Выбранные товары.",
      path: "/cart",
      type: "website",
    });

    expect(metadata.openGraph).toMatchObject({
      title: "Корзина",
      description: "Выбранные товары.",
      url: "/cart",
      type: "website",
    });
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).toEqual({
      card: "summary",
      title: "Корзина",
      description: "Выбранные товары.",
    });
  });
});
