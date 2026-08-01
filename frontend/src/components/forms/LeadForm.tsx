"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { trackEvent } from "@/lib/analytics";
import { TurnstileField, type TurnstileFieldHandle } from "./TurnstileField";

export function LeadForm({
  categoryId,
  productId,
}: {
  categoryId?: string;
  productId?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const turnstile = useRef<TurnstileFieldHandle>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    delete payload.consent;
    const attribution = new URLSearchParams(window.location.search);
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        product: productId,
        category: categoryId,
        page_url: window.location.href,
        utm_source: attribution.get("utm_source") ?? undefined,
        utm_medium: attribution.get("utm_medium") ?? undefined,
        utm_campaign: attribution.get("utm_campaign") ?? undefined,
        utm_content: attribution.get("utm_content") ?? undefined,
        utm_term: attribution.get("utm_term") ?? undefined,
      }),
    }).catch(() => null);
    if (response?.ok) {
      trackEvent("lead_submit", { source: "lead_form" });
      setState("success");
      return;
    }
    turnstile.current?.reset();
    setState("error");
  }

  if (state === "success") {
    return (
      <div className="lead-form__success" role="status">
        <strong>Заявка отправлена</strong>
        <p>Менеджер свяжется с вами по указанным контактам.</p>
        <Link href="/thank-you">Подробнее</Link>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={submit}>
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
        Что нужно подобрать
        <textarea maxLength={3000} name="message" rows={4} />
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
        {state === "sending" ? "Отправляем…" : "Отправить заявку"}
      </button>
      {state === "error" ? (
        <p className="lead-form__error" role="alert">
          Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз.
        </p>
      ) : null}
    </form>
  );
}
