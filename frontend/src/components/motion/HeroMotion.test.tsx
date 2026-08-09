import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroMotion } from "./HeroMotion";
import { ProcessMotion } from "./ProcessMotion";

describe("section motion wrappers", () => {
  it("keeps hero media static while content remains readable", () => {
    render(
      <HeroMotion media={<div>Фоновое изображение</div>}>
        <h1>Каталог комплектующих</h1>
      </HeroMotion>,
    );

    expect(
      screen.getByRole("heading", { name: "Каталог комплектующих" }),
    ).toBeVisible();
    expect(screen.getByTestId("hero-motion")).toHaveAttribute(
      "data-motion",
      "hero-static",
    );
    expect(screen.getByTestId("hero-motion-media")).not.toHaveAttribute(
      "style",
    );
  });

  it("renders process content and a decorative progress line", () => {
    render(
      <ProcessMotion>
        <article>Первый этап</article>
      </ProcessMotion>,
    );

    expect(screen.getByText("Первый этап")).toBeVisible();
    expect(screen.getByTestId("process-progress")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
