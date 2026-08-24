import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  ProductAnalogItem,
  ProductCardData,
} from "@/types/catalog";

import { RelatedProducts } from "./RelatedProducts";

const card = (id: string, title: string): ProductCardData => ({
  id,
  title,
  slug: `product-${id}`,
  sku: `SKU-${id}`,
  category: null,
  shortDescription: null,
  mainImageId: null,
  imageAlt: null,
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "on_request",
});

const analogItem = (
  relationType: ProductAnalogItem["relationType"],
  product: ProductCardData,
  direction: ProductAnalogItem["direction"] = "from",
): ProductAnalogItem => ({
  relationType,
  direction,
  product,
  sourceName: null,
  note: null,
  verifiedAt: null,
});

describe("RelatedProducts (R8 dual-read)", () => {
  it("renders analog rows grouped by relation type", () => {
    render(
      <RelatedProducts
        products={[card("legacy-1", "Legacy товар")]}
        analogs={{
          analogs: [
            analogItem("analog", card("a1", "Аналог один")),
            analogItem("analog", card("a2", "Аналог два")),
            analogItem("oem_cross", card("o1", "OEM кросс товар")),
          ],
          supersededBy: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Аналоги" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Взаимозаменяемые артикулы (OEM-кросс)" }),
    ).toBeInTheDocument();
    // Both analog cards and the cross card render inside their groups.
    expect(screen.getByRole("link", { name: "Аналог один" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Аналог два" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OEM кросс товар" })).toBeInTheDocument();
    // The analog view wins, so the legacy fallback block must NOT render.
    expect(
      screen.queryByRole("heading", { name: "Похожие товары" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy товар")).not.toBeInTheDocument();
    // Empty relation types stay hidden.
    expect(
      screen.queryByRole("heading", { name: "Совместимые товары" }),
    ).not.toBeInTheDocument();
  });

  it("renders supersession as the distinct «этот артикул заменён» block", () => {
    render(
      <RelatedProducts
        products={[]}
        analogs={{
          analogs: [],
          supersededBy: [analogItem("superseded_by", card("r1", "Артикул-замена"))],
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Этот артикул заменён" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Артикул-замена" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Похожие товары" }),
    ).not.toBeInTheDocument();
  });

  it("never shadows non-empty legacy related_products with an empty analog view", () => {
    render(
      <RelatedProducts
        products={[card("legacy-1", "Legacy товар"), card("legacy-2", "Ещё legacy")]}
        analogs={{ analogs: [], supersededBy: [] }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Похожие товары" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Legacy товар" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ещё legacy" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Этот артикул заменён" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the exact legacy-only rendering when no analog view is passed", () => {
    const { container } = render(
      <RelatedProducts products={[card("legacy-1", "Legacy товар")]} />,
    );

    const sections = container.querySelectorAll("section.product-section");
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveAttribute("aria-labelledby", "related-title");
    expect(screen.getByRole("heading", { name: "Похожие товары" })).toBeInTheDocument();
  });

  it("renders nothing when both the analog view and legacy data are empty", () => {
    const { container } = render(
      <RelatedProducts products={[]} analogs={{ analogs: [], supersededBy: [] }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
