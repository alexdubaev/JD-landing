import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/types/catalog";

import ProductPage, { generateMetadata } from "./page";

const {
  getFilesByIdsMock,
  getProductBySlugsMock,
  getProductsByIdsMock,
} = vi.hoisted(() => ({
  getFilesByIdsMock: vi.fn(),
  getProductBySlugsMock: vi.fn(),
  getProductsByIdsMock: vi.fn(),
}));

vi.mock("@/lib/directus/catalog", () => ({
  getFilesByIds: getFilesByIdsMock,
  getProductBySlugs: getProductBySlugsMock,
  getProductsByIds: getProductsByIdsMock,
}));

const product: Product = {
  id: "product-1",
  title: "Насос гидравлический",
  slug: "hydraulic-pump",
  sku: "RE654321",
  category: {
    id: "category-1",
    title: "Гидравлика",
    slug: "hydraulics",
  },
  shortDescription: "Компонент гидравлической системы.",
  fullDescription: "Описание назначения детали.",
  seoText: null,
  analogSkus: [],
  mainImageId: null,
  imageAlt: null,
  galleryIds: [],
  specifications: [],
  documentIds: [],
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "on_request",
  seoTitle: null,
  seoDescription: null,
  ogImageId: null,
  relatedProductIds: [],
  ctaText: null,
};

describe("product page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProductBySlugsMock.mockResolvedValue(product);
    getFilesByIdsMock.mockResolvedValue([]);
    getProductsByIdsMock.mockResolvedValue([]);
  });

  it("renders one H1, SKU, request price, and the branded gallery fallback", async () => {
    render(
      await ProductPage({
        params: Promise.resolve({
          categorySlug: "hydraulics",
          productSlug: "hydraulic-pump",
        }),
      }),
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Насос гидравлический",
    );
    expect(screen.getByText(/RE654321/)).toBeInTheDocument();
    expect(screen.getByText("Цена по запросу")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: product.title })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uses the branded placeholder as an Open Graph image when a product image is absent", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({
        categorySlug: "hydraulics",
        productSlug: "hydraulic-pump",
      }),
    });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://deere-shop.ru/images/catalog/product-placeholder-industrial.webp",
        alt: product.title,
      },
    ]);
  });

  it("shows supplied replacement SKUs next to the primary SKU", async () => {
    getProductBySlugsMock.mockResolvedValue({
      ...product,
      analogSkus: ["PGF7949", "RE210102"],
    });

    render(
      await ProductPage({
        params: Promise.resolve({
          categorySlug: "hydraulics",
          productSlug: "hydraulic-pump",
        }),
      }),
    );

    expect(screen.getByText("Замены: PGF7949, RE210102")).toBeInTheDocument();
  });

  it("renders only provided specifications and fixed price data", async () => {
    getProductBySlugsMock.mockResolvedValue({
      ...product,
      price: 250000,
      priceStatus: "fixed",
      specifications: [{ name: "Масса", value: "12 кг" }],
    });

    render(
      await ProductPage({
        params: Promise.resolve({
          categorySlug: "hydraulics",
          productSlug: "hydraulic-pump",
        }),
      }),
    );

    expect(screen.getByText(/250\s*000/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Масса");
    expect(screen.getByRole("table")).toHaveTextContent("12 кг");
    expect(screen.queryByText(/официальн/i)).not.toBeInTheDocument();
  });
});
