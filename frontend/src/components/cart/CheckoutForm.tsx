"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { collectUtmAttribution, trackEvent } from "@/lib/analytics";
import { useCart } from "@/lib/cart/context";
import { MarketingConsent } from "@/components/forms/MarketingConsent";
import { TurnstileField, type TurnstileFieldHandle } from "@/components/forms/TurnstileField";
import { useFormSubmit } from "@/lib/forms/use-form-submit";

export function CheckoutForm() {
  const { lines, clearCart } = useCart();
  const { state, serverError, submit } = useFormSubmit();
  const [orderId, setOrderId] = useState<string | null>(null);
  const turnstile = useRef<TurnstileFieldHandle>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const ok = await submit(
      () =>
        fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: payload.name,
            phone: payload.phone,
            email: payload.email,
            comment: payload.comment,
            page_url: window.location.href,
            ...collectUtmAttribution(),
            marketing_consent: payload.marketing_consent === "on",
            items: lines.map((line) => ({
              product: line.id,
              sku: line.sku,
              title: line.title,
              unit_price: line.unitPrice,
              quantity: line.quantity,
            })),
            website: payload.website ?? "",
          }),
        }),
      async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          order_id?: string;
        };
        trackEvent("order_submit", { order_id: body.order_id ?? "" });
        setOrderId(body.order_id ?? null);
        clearCart();
      },
      "Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз.",
    );
    if (!ok) {
      turnstile.current?.reset();
    }
  }

  if (state === "success") {
    return (
      <div className="order-success" role="status">
        <CheckCircle2 aria-hidden="true" className="order-success__icon" />
        <strong>Заказ оформлен</strong>
        {orderId ? (
          <p>
            Номер заказа: <span className="order-success__id">{orderId}</span>
          </p>
        ) : null}
        <p>Менеджер свяжется с вами для подтверждения наличия, цены и сроков.</p>
        <Link className="order-success__link" href="/catalog">
          Продолжить покупки
        </Link>
      </div>
    );
  }

  return (
    <form className="lead-form checkout-form" onSubmit={handleSubmit}>
      <p className="checkout-form__title">Контактные данные</p>
      <label>
        Имя
        <input autoComplete="name" maxLength={100} name="name" required />
      </label>
      <label>
        Телефон
        <input
          autoComplete="tel"
          inputMode="tel"
          maxLength={40}
          name="phone"
          required
        />
      </label>
      <label>
        Email
        <input autoComplete="email" maxLength={254} name="email" type="email" />
      </label>
      <label className="lead-form__message">
        Комментарий к заказу
        <textarea
          maxLength={2000}
          name="comment"
          placeholder="Удобное время звонка, регион доставки, особые условия"
          rows={3}
        />
      </label>
      <label className="lead-form__honeypot" aria-hidden="true">
        Сайт
        <input autoComplete="off" name="website" tabIndex={-1} />
      </label>
      <label className="lead-form__consent">
        <input name="consent" required type="checkbox" />
        <span>
          Согласен с{" "}
          <Link href="/privacy-policy">политикой конфиденциальности</Link>
        </span>
      </label>
      <MarketingConsent />
      <TurnstileField ref={turnstile} />
      <button
        className="button button--primary"
        disabled={state === "sending"}
        type="submit"
      >
        {state === "sending" ? "Отправляем заказ…" : "Подтвердить заказ"}
      </button>
      {state === "error" && serverError ? (
        <p className="lead-form__error" role="alert">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
