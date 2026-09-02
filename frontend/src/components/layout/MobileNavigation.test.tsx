import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileNavigation } from "./MobileNavigation";

const navigation = [
  { id: "catalog", label: "Каталог", url: "/catalog" },
  { id: "delivery", label: "Доставка", url: "/delivery" },
];

describe("MobileNavigation", () => {
  it("closes on Escape and returns focus to its toggle", async () => {
    render(<MobileNavigation navigation={navigation} />);

    const toggle = screen.getByRole("button", { name: "Открыть меню" });
    fireEvent.click(toggle);
    expect(screen.getByRole("navigation", { name: "Мобильная навигация" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(
      screen.queryByRole("navigation", { name: "Мобильная навигация" }),
    ).not.toBeInTheDocument());
    expect(toggle).toHaveFocus();
  });
});
