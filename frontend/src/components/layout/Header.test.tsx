import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getHeaderNavigation, Header } from "./Header";

const navigation = [
  { id: "catalog", label: "Каталог", url: "/catalog" },
  { id: "delivery", label: "Доставка", url: "/delivery" },
];

describe("Header", () => {
  it("keeps a non-empty published CMS navigation exactly as configured", () => {
    expect(
      getHeaderNavigation([
        { id: "cms-parts", label: "Запчасти", url: "/catalog" },
        { id: "cms-about", label: "О компании", url: "/about" },
      ]),
    ).toEqual([
      { id: "cms-parts", label: "Запчасти", url: "/catalog" },
      { id: "cms-about", label: "О компании", url: "/about" },
    ]);
  });
  it("renders the wide DEERE-SHOP logo and accessible navigation", () => {
    const { container } = render(
      <Header navigation={navigation} phone="+7 900 000-00-00" />,
    );

    const logo = screen.getByRole("img", {
      name: "DEERE-SHOP — запчасти для спецтехники",
    });
    expect(logo).toHaveAttribute(
      "src",
      expect.stringContaining("deere-shop-logo.png"),
    );
    expect(logo).toHaveAttribute("width", "1829");
    expect(logo).toHaveAttribute("height", "251");
    expect(
      screen.getByRole("navigation", { name: "Основная навигация" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Каталог" })[0]).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(
      screen.getByRole("link", { name: "+7 900 000-00-00" }),
    ).toHaveAttribute("href", "tel:+79000000000");
    expect(
      screen.getByRole("button", { name: "Связаться с нами" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Доставка" }),
    ).toHaveAttribute("href", "/delivery");
    expect(container.querySelector(".site-header-spacer")).not.toBeInTheDocument();
  });

  it("opens and closes the mobile navigation with an accessible button", () => {
    render(<Header navigation={navigation} />);

    const menuButton = screen.getByRole("button", { name: "Открыть меню" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);

    expect(
      screen.getByRole("button", { name: "Закрыть меню" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: "Мобильная навигация" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Отправить запрос" }).at(-1),
    ).toHaveAttribute("href", "/parts-request");
  });

  it("switches to a compact sticky state while scrolling", () => {
    render(<Header navigation={navigation} />);

    const header = screen.getByRole("banner");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 16 });
    fireEvent.scroll(window);

    expect(header).toHaveAttribute("data-scrolled", "true");
  });
});
