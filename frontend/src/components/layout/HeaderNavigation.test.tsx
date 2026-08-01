import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalog/engine",
}));

import { HeaderNavigation } from "./HeaderNavigation";

describe("HeaderNavigation", () => {
  it("marks the pathname-matching CMS link as the current page", () => {
    render(
      <HeaderNavigation
        navigation={[
          { label: "Запчасти", url: "/catalog" },
          { label: "Компания", url: "/about" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Запчасти" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Компания" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
