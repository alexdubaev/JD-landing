import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScrollProgress } from "./ScrollProgress";

describe("ScrollProgress", () => {
  it("reports the visible reading progress", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 500,
    });

    render(<ScrollProgress />);
    fireEvent.scroll(window);

    expect(
      screen.getByRole("progressbar", { name: "Прогресс страницы" }),
    ).toHaveAttribute("aria-valuenow", "50");
  });
});
