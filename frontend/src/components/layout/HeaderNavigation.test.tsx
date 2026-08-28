import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/catalog/engine" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

import { HeaderNavigation } from "./HeaderNavigation";

describe("HeaderNavigation", () => {
  it("marks the pathname-matching CMS link as the current page", () => {
    render(
      <HeaderNavigation
        navigation={[
          { id: "nav-catalog", label: "Запчасти", url: "/catalog" },
          { id: "nav-about", label: "Компания", url: "/about" },
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

  it("does not mark a hash link as active on the homepage", () => {
    pathname.value = "/";
    render(
      <HeaderNavigation
        navigation={[{ id: "nav-consult", label: "Подбор", url: "/#consultation" }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Подбор" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
