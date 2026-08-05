"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { trackEvent } from "@/lib/analytics";
import { useCart } from "@/lib/cart/context";
import { TurnstileField, type TurnstileFieldHandle } from "@/components/forms/TurnstileField";

type SubmitState = "idle" | "sending" | "success" | "error";

export function CheckoutForm() {
  const { lines, clearCart } = useCart();
  const [state, setState] = useState<SubmitState>("idle");
  const [orderId, setOrderId] = useState<string | null>(null);
  const turnstile = useRef<TurnstileFieldHandle>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const attribution = new URLSearchParams(window.location.search);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        comment: payload.comment,
        page_url: window.location.href,
        utm_source: attribution.get("utm_source") ?? undefined,
        utm_medium: attribution.get("utm_medium") ?? undefined,
        utm_campaign: attribution.get("utm_campaign") ?? undefined,
        utm_content: attribution.get("utm_content") ?? undefined,
        utm_term: attribution.get("utm_term") ?? undefined,
        items: lines.map((line) => ({
          product: line.id,
          sku: line.sku,
          title: line.title,
          unit_price: line.unitPrice,
          quantity: line.quantity,
        })),
        website: payload.website ?? "",
      }),
    }).catch(() => null);

    if (response?.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        order_id?: string;
      };
      trackEvent("order_submit", { order_id: body.order_id ?? "" });
      setOrderId(body.order_id ?? null);
      clearCart();
      setState("success");
      return;
    }

    turnstile.current?.reset();
    setState("error");
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
    <form className="lead-form checkout-form" onSubmit={submit}>
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
      <TurnstileField ref={turnstile} />
      <button
        className="button button--primary"
        disabled={state === "sending"}
        type="submit"
      >
        {state === "sending" ? "Отправляем заказ…" : "Подтвердить заказ"}
      </button>
      {state === "error" ? (
        <p className="lead-form__error" role="alert">
          Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз.
        </p>
      ) : null}
    </form>
  );
}
