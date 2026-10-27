import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), clearCart: vi.fn() }));
vi.mock("@/lib/cart/context", () => ({
  useCart: () => ({
    lines: [{ id: "p1", sku: "RE504836", title: "Фильтр", unitPrice: 1500, quantity: 2 }],
    clearCart: mocks.clearCart,
  }),
}));
vi.mock("@/lib/forms/use-form-submit", () => ({
  useFormSubmit: () => ({ state: "idle", serverError: null, submit: mocks.submit }),
}));
vi.mock("@/components/forms/TurnstileField", () => ({
  TurnstileField: () => <input name="turnstile_token" type="hidden" value="visitor-token" />,
}));

import { CheckoutForm } from "./CheckoutForm";

describe("CheckoutForm", () => {
  it("sends the Turnstile token with the order payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ order_id: "order-1" }), { status: 201 }),
    );
    mocks.submit.mockImplementation(async (request: () => Promise<Response>, success: (response: Response) => Promise<void>) => {
      await success(await request());
      return true;
    });
    render(<CheckoutForm />);
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "+7 900 000-00-00" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /политикой конфиденциальности/i }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить заказ" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      turnstile_token: "visitor-token",
      items: [{ product: "p1", quantity: 2 }],
    });
  });
});
