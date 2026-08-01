import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeadForm } from "./LeadForm";

describe("LeadForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.dataLayer;
  });

  it("submits the lead and announces success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    window.dataLayer = [];
    render(<LeadForm />);

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Заявка отправлена",
      ),
    );
    expect(window.dataLayer).toContainEqual({ event: "lead_submit", source: "lead_form" });
  });
});
