import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the commercial hero, search, and catalog entry points", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /запчасти.*john deere/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /сельскохозяйственная техника в поле/i }),
    ).toHaveAttribute("src", expect.stringContaining("hero-machinery-v1.webp"));
    expect(
      screen.getByRole("search", { name: /поиск по каталогу/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /перейти в каталог/i })[0],
    ).toHaveAttribute("href", "/catalog");
    expect(
      screen.getByRole("heading", { level: 2, name: /категории запчастей/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByText(/не заявляет статус официального/i)).toBeInTheDocument();
  });
});
