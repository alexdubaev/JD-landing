import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/lib/cart/context";

import { Modal } from "./Modal";

describe("Modal", () => {
  it("labels the dialog and closes it with Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Заявка на подбор">
        <p>Форма заявки</p>
      </Modal>,
    );

    expect(
      screen.getByRole("dialog", { name: "Заявка на подбор" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("can render as a centered dialog instead of a filter drawer", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Связаться с нами" variant="dialog">
        <p>Форма обратной связи</p>
      </Modal>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("modal__dialog--dialog");
  });

  it("mounts the modal outside transformed or filtered page chrome", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Контакты">
        <p>Форма</p>
      </Modal>,
    );

    expect(document.body.querySelector(".modal")?.parentElement).toBe(
      document.body,
    );
  });

  it("restores focus to the opener after closing, including during exit animation", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Открыть фильтры";
    document.body.append(opener);
    opener.focus();

    const view = render(
      <Modal isOpen onClose={onClose} title="Фильтры">
        <button type="button">Применить</button>
      </Modal>,
    );

    expect(screen.getByRole("button", { name: "Закрыть" })).toHaveFocus();
    view.rerender(
      <CartProvider>
        <Modal isOpen={false} onClose={onClose} title="Фильтры">
          <button type="button">Применить</button>
        </Modal>
      </CartProvider>,
    );

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("loops Tab and Shift+Tab across visible, enabled focusable controls", () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
      length: 1,
      item: () => null,
      [Symbol.iterator]: function* () {
        yield {} as DOMRect;
      },
    } as DOMRectList);

    render(
      <Modal isOpen onClose={vi.fn()} title="Фильтры">
        <input aria-label="Поиск" />
        <button disabled type="button">Недоступно</button>
        <button aria-hidden="true" type="button">Скрыто для доступности</button>
        <button hidden type="button">Скрыто</button>
        <button type="button">Последнее</button>
      </Modal>,
    );

    const close = screen.getByRole("button", { name: "Закрыть" });
    const last = screen.getByRole("button", { name: "Последнее" });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("keeps focus and calls the latest onClose after parent rerenders", () => {
    const firstOnClose = vi.fn();
    const latestOnClose = vi.fn();
    const view = render(
      <Modal isOpen onClose={firstOnClose} title="Фильтры">
        <input aria-label="Поиск" />
      </Modal>,
    );
    const search = screen.getByRole("textbox", { name: "Поиск" });
    search.focus();

    view.rerender(
      <CartProvider>
        <Modal isOpen onClose={latestOnClose} title="Фильтры">
          <input aria-label="Поиск" />
        </Modal>
      </CartProvider>,
    );

    expect(screen.getByRole("textbox", { name: "Поиск" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(firstOnClose).not.toHaveBeenCalled();
    expect(latestOnClose).toHaveBeenCalledOnce();
  });
});
