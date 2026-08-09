import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ProductVerification } from "./ProductVerification";

it("shows confirmed product-review data", () => {
  render(
    <ProductVerification
      product={{
        sku: "RE530656",
        category: null,
        verifiedAt: "2026-08-01",
        reviewedBy: "Специалист по подбору",
        sourceName: null,
        sourceUrl: null,
      }}
    />,
  );

  expect(screen.getByText(/данные проверены/i)).toBeInTheDocument();
  expect(screen.getByText(/проверил: специалист по подбору/i)).toBeInTheDocument();
});

it("omits the section when product-review data is unavailable", () => {
  const { container } = render(
    <ProductVerification
      product={{
        sku: "RE530656",
        category: null,
        verifiedAt: null,
        reviewedBy: null,
        sourceName: null,
        sourceUrl: null,
      }}
    />,
  );

  expect(container).toBeEmptyDOMElement();
});
