"use client";

import Link from "next/link";
import { useRef, type FormEvent } from "react";

import { collectUtmAttribution, trackEvent } from "@/lib/analytics";
import { useFormSubmit } from "@/lib/forms/use-form-submit";
import { MarketingConsent } from "./MarketingConsent";
import { TurnstileField, type TurnstileFieldHandle } from "./TurnstileField";

export function LeadForm({
  categoryId,
  productId,
}: {
  categoryId?: string;
  productId?: string;
}) {
  const { state, serverError, submit } = useFormSubmit();
  const turnstile = useRef<TurnstileFieldHandle>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    delete payload.consent;
    const ok = await submit(
      () =>
        fetch("/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...payload,
            ...collectUtmAttribution(),
            marketing_consent: form.has("marketing_consent"),
            product: productId,
            category: categoryId,
            page_url: window.location.href,
          }),
        }),
      () => trackEvent("lead_submit", { source: "lead_form" }),
      "Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз.",
    );
    if (!ok) turnstile.current?.reset();
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
    <form className="lead-form" onSubmit={handleSubmit}>
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
      <MarketingConsent />
      <TurnstileField ref={turnstile} />
      <button
        className="button button--primary"
        disabled={state === "sending"}
        type="submit"
      >
        {state === "sending" ? "Отправляем…" : "Отправить заявку"}
      </button>
      {state === "error" && serverError ? (
        <p className="lead-form__error" role="alert">
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
