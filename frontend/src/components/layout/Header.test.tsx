import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Header } from "./Header";

const navigation = [
  { label: "Каталог", url: "/catalog" },
  { label: "Доставка", url: "/delivery" },
];

describe("Header", () => {
  it("renders the supplied brand logo and accessible desktop navigation", () => {
    render(<Header navigation={navigation} phone="+7 900 000-00-00" />);

    expect(
      screen.getByRole("img", {
        name: "СМ ТЕХНО — запчасти для спецтехники",
      }),
    ).toHaveAttribute("src", expect.stringContaining("sm-techno-logo.png"));
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
  });
});
