import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it } from "vitest";

import { InteractiveCard } from "./InteractiveCard";
import { Reveal } from "./Reveal";
import { RouteTransition } from "./RouteTransition";
import { Stagger, StaggerItem } from "./Stagger";

describe("motion primitives", () => {
  it("reveals a whole section without blur or scale", () => {
    render(
      <Reveal>
        <p>Важный контент</p>
      </Reveal>,
    );

    const reveal = screen.getByText("Важный контент").parentElement;
    expect(reveal).toHaveAttribute("data-motion", "reveal");
    expect(reveal).toHaveAttribute("data-motion-direction", "up");
    expect(reveal).not.toHaveStyle({ filter: "blur(6px)" });
    expect(reveal?.getAttribute("style") ?? "").not.toContain("scale");
  });

  it("renders stagger items without blur, scale, or translated positions", () => {
    render(
      <Stagger as="ul" aria-label="Категории">
        <StaggerItem as="li">Двигатели</StaggerItem>
        <StaggerItem as="li">Гидравлика</StaggerItem>
      </Stagger>,
    );

    const list = screen.getByRole("list", { name: "Категории" });
    expect(list).toHaveAttribute("data-motion-group", "stagger");
    const item = screen.getByText("Гидравлика");
    expect(item).toHaveAttribute("data-motion-item", "stagger");
    expect(item.getAttribute("style") ?? "").not.toMatch(
      /blur|scale|translate/iu,
    );
  });

  it("preserves a card link without applying an inline transform", () => {
    render(
      <InteractiveCard>
        <Link href="/catalog">Открыть каталог</Link>
      </InteractiveCard>,
    );

    const link = screen.getByRole("link", { name: "Открыть каталог" });
    expect(link).toHaveAttribute("href", "/catalog");
    expect(link.parentElement).toHaveAttribute(
      "data-motion",
      "interactive-card",
    );
    expect(link.parentElement?.getAttribute("style") ?? "").not.toContain(
      "transform",
    );
  });

  it("keeps route content readable while the entry accent animates", () => {
    render(
      <RouteTransition>
        <h1>Каталог</h1>
      </RouteTransition>,
    );

    expect(screen.getByRole("heading", { name: "Каталог" })).toBeVisible();
    expect(screen.getByTestId("route-transition")).toBeInTheDocument();
  });
});
