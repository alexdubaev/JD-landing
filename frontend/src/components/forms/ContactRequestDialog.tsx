"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { Modal } from "@/components/ui/Modal";
import { collectUtmAttribution, trackEvent } from "@/lib/analytics";
import { useFormSubmit } from "@/lib/forms/use-form-submit";

import { TurnstileField, type TurnstileFieldHandle } from "./TurnstileField";

export function ContactRequestDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { state, serverError, submit, reset } = useFormSubmit();
  const turnstile = useRef<TurnstileFieldHandle>(null);

  const close = () => {
    setIsOpen(false);
    reset();
  };

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
            submission_type: "contact",
            page_url: window.location.href,
          }),
        }),
      () => trackEvent("lead_submit", { source: "header_contact_modal" }),
      "Не удалось отправить сообщение. Проверьте данные и попробуйте ещё раз.",
    );
    if (!ok) turnstile.current?.reset();
  }

  return (
    <>
      <button
        className="site-header__request"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Связаться с нами
      </button>
      <Modal
        isOpen={isOpen}
        onClose={close}
        title="Связаться с нами"
        variant="dialog"
      >
        {state === "success" ? (
          <div className="contact-request__success" role="status">
            <strong>Сообщение отправлено</strong>
            <p>Спасибо! Мы ответим по указанным контактам.</p>
          </div>
        ) : (
          <form className="lead-form contact-request" onSubmit={handleSubmit}>
            <p className="contact-request__hint" id="contact-request-contact-help">
              Укажите телефон или почту — достаточно одного.
            </p>
            <label>
              Имя
              <input autoComplete="name" maxLength={100} name="name" required />
            </label>
            <label>
              Телефон
              <input
                aria-describedby="contact-request-contact-help"
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                name="phone"
              />
            </label>
            <label>
              Почта
              <input
                aria-describedby="contact-request-contact-help"
                autoComplete="email"
                maxLength={254}
                name="email"
                type="email"
              />
            </label>
            <label className="lead-form__message">
              Ваш вопрос
              <textarea maxLength={3000} name="message" required rows={5} />
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
              {state === "sending" ? "Отправляем…" : "Отправить сообщение"}
            </button>
            {state === "error" && serverError ? (
              <p className="lead-form__error" role="alert">
                {serverError}
              </p>
            ) : null}
          </form>
        )}
      </Modal>
    </>
  );
}
