import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimatedAccordion } from "./AnimatedAccordion";

const items = [
  {
    id: "delivery",
    question: "Как выполняется доставка?",
    answer: "Способ и срок согласовываются с менеджером.",
  },
];

describe("AnimatedAccordion", () => {
  it("announces and reveals an answer from an accessible button", async () => {
    render(<AnimatedAccordion items={items} />);

    const trigger = screen.getByRole("button", {
      name: "Как выполняется доставка?",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Способ и срок согласовываются с менеджером."),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(
        screen.getByText("Способ и срок согласовываются с менеджером."),
      ).toBeVisible();
    });
  });
});
