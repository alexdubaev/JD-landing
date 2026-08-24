import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductGallery } from "./ProductGallery";

describe("ProductGallery", () => {
  it("renders the branded placeholder when a product has no images", () => {
    render(<ProductGallery imageAlt="Товар без фото" images={[]} />);

    const fallback = screen.getByRole("img", { name: "Товар без фото" });
    expect(decodeURIComponent(fallback.getAttribute("src") ?? "")).toContain(
      "/images/catalog/product-placeholder-industrial.webp",
    );
  });

  it("renders canonical product_images rows with their own alt texts", () => {
    render(
      <ProductGallery
        imageAlt="Товар"
        images={[
          { imageId: "image-one", alt: "Насос в разрезе" },
          { imageId: "image-two", alt: "Насос сзади" },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Насос в разрезе" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Показать изображение/ })).toHaveLength(
      2,
    );
  });

  it("falls back to the product-level alt for legacy gallery references", () => {
    render(
      <ProductGallery
        imageAlt="Насос гидравлический"
        images={[
          { imageId: "legacy-one", alt: null },
          { imageId: "legacy-two", alt: null },
        ]}
      />,
    );

    // The legacy mapper produces items without a per-image alt, so the active
    // image is announced with the shared product-level alt; the thumbnails
    // (empty alts) remain decorative controls.
    expect(
      screen.getByRole("img", { name: "Насос гидравлический" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Показать изображение/ })).toHaveLength(
      2,
    );
  });

  it("changes the selected image while retaining accessible controls", () => {
    render(
      <ProductGallery
        imageAlt="Товар"
        images={[
          { imageId: "image-one", alt: null },
          { imageId: "image-two", alt: null },
        ]}
      />,
    );

    const second = screen.getByRole("button", {
      name: "Показать изображение 2",
    });
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
  });
});
