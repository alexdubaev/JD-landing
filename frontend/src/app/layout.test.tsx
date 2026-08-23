import { Children, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { getSiteSettingsMock } = vi.hoisted(() => ({
  getSiteSettingsMock: vi.fn(),
}));

vi.mock("@/lib/directus/content", () => ({
  getContacts: vi.fn().mockResolvedValue([]),
  getNavigation: vi.fn().mockResolvedValue([]),
  getSiteSettings: getSiteSettingsMock,
}));

vi.mock("@/components/layout/Analytics", () => ({
  Analytics: () => null,
}));
vi.mock("@/components/layout/Footer", () => ({
  Footer: () => null,
}));
vi.mock("@/components/layout/Header", () => ({
  Header: () => null,
}));
vi.mock("@/components/motion/RouteTransition", () => ({
  RouteTransition: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/cart/context", () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import RootLayout, { generateMetadata } from "./layout";

describe("root metadata and discovery links", () => {
  it("exposes absolute root OG URL and page-specific Twitter metadata", async () => {
    getSiteSettingsMock.mockResolvedValue({
      companyName: "ООО СМ ТЕХНО",
      seoTitle: "Каталог John Deere",
      seoDescription: "Поставка комплектующих по России.",
      ogTitle: null,
      ogDescription: null,
      defaultOgImageId: null,
    });

    const metadata = await generateMetadata();

    expect(metadata.openGraph).toMatchObject({
      title: "Каталог John Deere",
      description: "Поставка комплектующих по России.",
      url: "https://deere-shop.ru/",
    });
    expect(metadata.twitter).toMatchObject({
      title: "Каталог John Deere",
      description: "Поставка комплектующих по России.",
    });
  });

  it("declares the plain-text llms resource with a descriptive title", async () => {
    getSiteSettingsMock.mockResolvedValue(null);

    const layout = (await RootLayout({ children: <span>content</span> })) as ReactElement<{
      children: ReactNode;
    }>;
    const [head] = Children.toArray(layout.props.children) as [
      ReactElement<{ children: ReactNode }>,
    ];
    const [link] = Children.toArray(head.props.children) as [
      ReactElement<Record<string, string>>,
    ];

    expect(link.type).toBe("link");
    expect(link.props).toMatchObject({
      rel: "alternate",
      type: "text/plain",
      href: "/llms.txt",
      title: "Описание сайта для ИИ",
    });
  });
});
