import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("introduces the John Deere catalog and links to it", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /john deere/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /перейти в каталог/i }),
    ).toHaveAttribute("href", "/catalog");
  });
});
