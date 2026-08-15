import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders the canonical child-collection media when the dual-read wins", async () => {
    getProductBySlugsMock.mockResolvedValue({
      ...product,
      mainImageId: "child-image-1",
      images: [
        { imageId: "child-image-2", alt: "Насос в разрезе" },
        { imageId: "child-image-3", alt: null },
      ],
      mediaSources: {
        images: "children",
        specifications: "children",
        documents: "children",
      },
      specifications: [{ name: "Масса", value: "12", unit: "кг", group: null }],
      documentIds: ["child-doc-1"],
      documentItems: [{ fileId: "child-doc-1", title: "Паспорт насоса" }],
    });
    getFilesByIdsMock.mockResolvedValue([
      { id: "child-doc-1", filename: "pasport.pdf", title: null, type: null },
    ]);

    render(
      await ProductPage({
        params: Promise.resolve({
          categorySlug: "hydraulics",
          productSlug: "hydraulic-pump",
        }),
      }),
    );

    // The active gallery image is the child row with its own alt text, and
    // the canonical specification row renders value + unit.
    expect(
      screen.getByRole("img", { name: "Насос гидравлический" }),
    ).toBeInTheDocument();
    const second = screen.getByRole("button", { name: "Показать изображение 2" });
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table")).toHaveTextContent("12 кг");
    expect(screen.getByRole("link", { name: "Паспорт насоса" })).toHaveAttribute(
      "href",
      "/media/child-doc-1",
    );
  });

  it("falls back to the legacy JSON media when the child collections are empty", async () => {
    getProductBySlugsMock.mockResolvedValue({
      ...product,
      imageAlt: "Насос гидравлический",
      images: [
        { imageId: "legacy-gallery-1", alt: null },
        { imageId: "legacy-gallery-2", alt: null },
      ],
      mediaSources: {
        images: "legacy",
        specifications: "legacy",
        documents: "legacy",
      },
      specifications: [{ name: "Масса", value: "12 кг", unit: null, group: null }],
      documentIds: ["legacy-doc-1"],
      documentItems: [{ fileId: "legacy-doc-1", title: null }],
    });
    getFilesByIdsMock.mockResolvedValue([
      { id: "legacy-doc-1", filename: "rukovodstvo.pdf", title: null, type: null },
    ]);

    render(
      await ProductPage({
        params: Promise.resolve({
          categorySlug: "hydraulics",
          productSlug: "hydraulic-pump",
        }),
      }),
    );

    // Legacy gallery references carry no per-image alt, so the product-level
    // alt is used; the document falls back to its filename.
    expect(
      screen.getByRole("img", { name: "Насос гидравлический" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "rukovodstvo.pdf" })).toHaveAttribute(
      "href",
      "/media/legacy-doc-1",
    );
  });
});
