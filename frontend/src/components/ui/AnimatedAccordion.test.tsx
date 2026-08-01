import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimatedAccordion } from "./AnimatedAccordion";

describe("AnimatedAccordion", () => {
  it("keeps every FAQ answer in the initial HTML and opens only one panel", () => {
    render(
      <AnimatedAccordion
        items={[
          { id: "vat", question: "Работаете ли вы с НДС?", answer: "Условия уточняются в запросе." },
          { id: "delivery", question: "Доставляете ли вы по России?", answer: "Способ отправки согласуется отдельно." },
        ]}
      />,
    );

    const vat = screen.getByRole("button", { name: "Работаете ли вы с НДС?" });
    const delivery = screen.getByRole("button", { name: "Доставляете ли вы по России?" });

    expect(screen.getByText("Условия уточняются в запросе.")).toBeInTheDocument();
    expect(screen.getByText("Способ отправки согласуется отдельно.")).toBeInTheDocument();
    expect(vat).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(vat);
    expect(vat).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(delivery);
    expect(vat).toHaveAttribute("aria-expanded", "false");
    expect(delivery).toHaveAttribute("aria-expanded", "true");
  });
});
