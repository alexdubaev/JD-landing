import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => {
  throw new Error("Motion runtime must not be imported by RouteTransition");
});
vi.mock("next/navigation", () => ({
  usePathname: () => {
    throw new Error("RouteTransition must not read browser pathname");
  },
  useReducedMotion: () => false,
}));

import { RouteTransition } from "./RouteTransition";

describe("RouteTransition", () => {
  it("renders a server-compatible wrapper without browser navigation context", () => {
    render(
      <RouteTransition>
        <span>Содержимое страницы</span>
      </RouteTransition>,
    );

    expect(screen.getByTestId("route-transition")).toBeInTheDocument();
    expect(screen.getByText("Содержимое страницы")).toBeInTheDocument();
    expect(document.querySelector(".route-transition__accent")).toBeInTheDocument();
  });
});
