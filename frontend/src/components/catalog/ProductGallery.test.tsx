import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductGallery } from "./ProductGallery";

describe("ProductGallery", () => {
  it("renders the branded placeholder when a product has no images", () => {
    render(<ProductGallery imageAlt="Товар без фото" imageIds={[]} />);

    const fallback = screen.getByRole("img", { name: "Товар без фото" });
    expect(decodeURIComponent(fallback.getAttribute("src") ?? "")).toContain(
      "/images/catalog/product-placeholder-industrial.webp",
    );
  });

  it("changes the selected image while retaining accessible controls", () => {
    render(
      <ProductGallery
        imageAlt="Товар"
        imageIds={["image-one", "image-two"]}
      />,
    );

    const second = screen.getByRole("button", {
      name: "Показать изображение 2",
    });
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
  });
});
