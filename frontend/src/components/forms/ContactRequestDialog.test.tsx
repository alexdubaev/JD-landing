import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactRequestDialog } from "./ContactRequestDialog";

describe("ContactRequestDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("opens a contact form and submits it with either email or phone", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    render(<ContactRequestDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Связаться с нами" }));

    expect(
      screen.getByRole("dialog", { name: "Связаться с нами" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Укажите телефон или почту — достаточно одного."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Телефон")).not.toBeRequired();
    expect(screen.getByLabelText("Почта")).not.toBeRequired();

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    });
    fireEvent.change(screen.getByLabelText("Почта"), {
      target: { value: "ivan@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Ваш вопрос"), {
      target: { value: "Подскажите условия поставки" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /политикой конфиденциальности/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      submission_type: "contact",
      name: "Иван",
      email: "ivan@example.test",
      message: "Подскажите условия поставки",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Сообщение отправлено");
  });

  it("requires at least two characters in the name", () => {
    render(<ContactRequestDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Связаться с нами" }));

    expect(screen.getByLabelText("Имя")).toHaveAttribute("minLength", "2");
  });
});
