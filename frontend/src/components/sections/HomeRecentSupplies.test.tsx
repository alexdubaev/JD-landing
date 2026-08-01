import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeRecentSupplies } from "./HomeRecentSupplies";

describe("HomeRecentSupplies", () => {
  it("does not render an empty supplies section", () => {
    const { container } = render(<HomeRecentSupplies supplies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render records without any factual supply detail", () => {
    const { container } = render(
      <HomeRecentSupplies
        supplies={[{
          alt: null, deliveryTerm: null, equipmentType: null, id: "empty",
          imageId: null, positions: [], region: null, suppliedAt: null, supplyFormat: null,
        }]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders factual supply attributes supplied by CMS", () => {
    render(
      <HomeRecentSupplies
        supplies={[{
          alt: null,
          deliveryTerm: null,
          equipmentType: "Трактор",
          id: "supply-1",
          imageId: null,
          positions: ["Фильтр"],
          region: "Тверская область",
          suppliedAt: "2026-01-10T00:00:00.000Z",
          supplyFormat: null,
        }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Недавние поставки" })).toBeInTheDocument();
    expect(screen.getByText("Трактор")).toBeInTheDocument();
    expect(screen.getByText("Фильтр")).toBeInTheDocument();
  });
});
