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
    fireEvent.click(screen.getByRole("checkbox", { name: /политикой конфиденциальности/i }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Заявка отправлена",
      ),
    );
    expect(window.dataLayer).toContainEqual({ event: "lead_submit", source: "lead_form" });
  });

  it("shows the server-provided error message on validation failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Проверьте заполнение формы" }), {
        status: 400,
      }),
    );
    render(<LeadForm />);

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /политикой конфиденциальности/i }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Проверьте заполнение формы",
      ),
    );
  });

  it("falls back to a generic error when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(null as unknown as Response);
    render(<LeadForm />);

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /политикой конфиденциальности/i }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Не удалось отправить заявку/,
      ),
    );
  });

  it("renders optional marketing consent separately from required privacy consent", () => {
    render(<LeadForm />);

    const marketingConsent = screen.getByRole("checkbox", {
      name: /получать от ООО «СМ ТЕХНО» рекламные и информационные сообщения/i,
    });

    expect(marketingConsent).not.toBeRequired();
    expect(marketingConsent).not.toBeChecked();
  });

  it("sends marketing consent only when the optional checkbox is selected", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    render(<LeadForm />);

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /политикой конфиденциальности/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /получать от ООО «СМ ТЕХНО»/i }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      marketing_consent: true,
    });
  });
});
