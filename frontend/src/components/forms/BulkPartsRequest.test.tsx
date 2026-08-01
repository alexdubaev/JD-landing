import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkPartsRequest } from "./BulkPartsRequest";

describe("BulkPartsRequest", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("restores the saved list and lets the user clear it", () => {
    localStorage.setItem("deere-shop:parts-request-draft", "RE504836 — 2 шт.");
    render(<BulkPartsRequest />);

    expect(screen.getByLabelText("Список артикулов")).toHaveValue(
      "RE504836 — 2 шт.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
    expect(screen.getByLabelText("Список артикулов")).toHaveValue("");
    expect(localStorage.getItem("deere-shop:parts-request-draft")).toBeNull();
  });

  it("shows attached file details and lets the user remove a file", () => {
    render(<BulkPartsRequest />);
    const input = screen.getByLabelText("Загрузить Excel");
    const file = new File(["article,quantity"], "parts.csv", {
      type: "text/csv",
    });

    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("parts.csv")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить parts.csv" }));
    expect(screen.queryByText("parts.csv")).not.toBeInTheDocument();
  });

  it("submits normalized items as multipart data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    render(<BulkPartsRequest />);

    fireEvent.change(screen.getByLabelText("Список артикулов"), {
      target: { value: "RE504836 — 2 шт.\nre504836 3" },
    });
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Отправить список на расчёт" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("request_items")).toBe(
      JSON.stringify([{ article: "RE504836", quantity: 5 }]),
    );
  });

  it("submits a spreadsheet-only request without an empty item payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    render(<BulkPartsRequest />);

    fireEvent.change(screen.getByLabelText("Загрузить Excel"), {
      target: {
        files: [new File(["article"], "parts.csv", { type: "text/csv" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Отправить список на расчёт" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][1]?.body as FormData).has("request_items")).toBe(false);
  });

  it("submits a photo-only request without an empty item payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    render(<BulkPartsRequest />);

    fireEvent.change(screen.getByLabelText("Прикрепить фото"), {
      target: {
        files: [new File(["image"], "marking.webp", { type: "image/webp" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Отправить список на расчёт" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][1]?.body as FormData).has("request_items")).toBe(false);
  });
});
