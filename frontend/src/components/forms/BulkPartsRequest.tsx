"use client";

import {
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { parsePartsRequest } from "@/lib/leads/parts-request";
import {
  MAX_PHOTO_BYTES,
  MAX_SPREADSHEET_BYTES,
  validateLeadAttachment,
  type AttachmentKind,
} from "@/lib/leads/attachments";
import {
  clearGeneratedProductRequestLines,
  PRODUCT_REQUEST_LIST_EVENT,
  reconcileProductRequestDraft,
  setProductRequestList,
} from "@/lib/leads/product-request-list";
import { trackEvent } from "@/lib/analytics";
import { MarketingConsent } from "./MarketingConsent";
import { TurnstileField, type TurnstileFieldHandle } from "./TurnstileField";

const storageKey = "deere-shop:parts-request-draft";

export type PartsRequestMode = "list" | "excel" | "photo";

const readableSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
    : `${Math.max(1, Math.ceil(bytes / 1024))} КБ`;

const initialDraft = () =>
  typeof window === "undefined"
    ? ""
    : reconcileProductRequestDraft(localStorage.getItem(storageKey) ?? "");

export function BulkPartsRequest({
  initialMode = "list",
}: {
  initialMode?: PartsRequestMode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [spreadsheet, setSpreadsheet] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "success">("idle");
  const spreadsheetInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const listInput = useRef<HTMLTextAreaElement>(null);
  const spreadsheetControl = useRef<HTMLButtonElement>(null);
  const photoControl = useRef<HTMLButtonElement>(null);
  const turnstile = useRef<TurnstileFieldHandle>(null);
  const parsed = useMemo(() => parsePartsRequest(draft), [draft]);

  useEffect(() => {
    if (draft) localStorage.setItem(storageKey, draft);
    else localStorage.removeItem(storageKey);
  }, [draft]);

  useEffect(() => {
    const syncProducts = () =>
      setDraft((current) => reconcileProductRequestDraft(current));
    window.addEventListener(PRODUCT_REQUEST_LIST_EVENT, syncProducts);
    return () => window.removeEventListener(PRODUCT_REQUEST_LIST_EVENT, syncProducts);
  }, []);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (initialMode === "list") {
        listInput.current?.focus({ preventScroll: true });
        return;
      }

      document.getElementById("attachments")?.scrollIntoView?.({
        block: "center",
      });
      const control = initialMode === "excel" ? spreadsheetControl : photoControl;
      control.current?.focus({ preventScroll: true });
    }, 250);
    return () => window.clearTimeout(focusTimer);
  }, [initialMode]);

  function changeFile(kind: AttachmentKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const fileError = validateLeadAttachment(kind, file);
    if (fileError) {
      setError(fileError);
      event.target.value = "";
      return;
    }
    setError(null);
    if (kind === "spreadsheet") { setSpreadsheet(file); trackEvent("excel_upload"); }
    else { setPhoto(file); trackEvent("photo_upload"); }
  }

  function removeFile(kind: AttachmentKind) {
    if (kind === "spreadsheet") {
      setSpreadsheet(null);
      if (spreadsheetInput.current) spreadsheetInput.current.value = "";
    } else {
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  function clearDraft() {
    setDraft("");
    localStorage.removeItem(storageKey);
    clearGeneratedProductRequestLines();
    setProductRequestList([]);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasAttachment = Boolean(spreadsheet || photo);
    if (parsed.error && !hasAttachment) {
      setError(parsed.error);
      return;
    }
    setState("sending");
    setError(null);
    const form = new FormData(event.currentTarget);
    form.delete("consent");
    if (parsed.items.length) {
      form.set("request_items", JSON.stringify(parsed.items));
    }
    form.set("page_url", window.location.href);
    const attribution = new URLSearchParams(window.location.search);
    for (const key of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ]) {
      const value = attribution.get(key);
      if (value) form.set(key, value);
    }
    if (spreadsheet) form.set("spreadsheet", spreadsheet, spreadsheet.name);
    if (photo) form.set("photo", photo, photo.name);

    const response = await fetch("/api/leads", { method: "POST", body: form }).catch(
      () => null,
    );
    if (response?.ok) {
      trackEvent("lead_submit", { source: "parts_request" });
      setState("success");
      localStorage.removeItem(storageKey);
      clearGeneratedProductRequestLines();
      setProductRequestList([]);
      return;
    }
    const body = await response?.json().catch(() => null);
    turnstile.current?.reset();
    setError(body?.error ?? "Не удалось отправить список. Попробуйте ещё раз.");
    setState("idle");
  }

  if (state === "success") {
    return (
      <div className="parts-request__success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <strong>Список отправлен на расчёт</strong>
          <p>Мы свяжемся с вами по указанным контактам.</p>
        </div>
      </div>
    );
  }

  return (
    <form className="parts-request" onSubmit={submit}>
      <label className="parts-request__label" htmlFor="parts-request-list">
        Список артикулов
      </label>
      <textarea
        autoFocus={initialMode === "list"}
        id="parts-request-list"
        name="parts_request_draft"
        onChange={(event) => setDraft(event.target.value)}
        onPaste={() => trackEvent("parts_list_paste")}
        placeholder={"RE504836 — 2 шт.\nAL166181 — 1 шт.\nR123456 — 4 шт."}
        ref={listInput}
        rows={7}
        value={draft}
      />
      <div className="parts-request__summary" aria-live="polite">
        {parsed.items.length
          ? `Позиций в списке: ${parsed.items.length}`
          : "Добавьте от 1 до 100 позиций"}
      </div>
      <div className="parts-request__attachments" id="attachments">
        <button
          autoFocus={initialMode === "excel"}
          className={`button button--secondary${initialMode === "excel" ? " is-active" : ""}`}
          onClick={() => spreadsheetInput.current?.click()}
          ref={spreadsheetControl}
          type="button"
        >
          <FileSpreadsheet aria-hidden="true" />
          Загрузить Excel
        </button>
        <input
          accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          aria-label="Загрузить Excel"
          id="parts-request-sheet"
          onChange={(event) => changeFile("spreadsheet", event)}
          ref={spreadsheetInput}
          type="file"
        />
        <button
          autoFocus={initialMode === "photo"}
          className={`button button--secondary${initialMode === "photo" ? " is-active" : ""}`}
          onClick={() => photoInput.current?.click()}
          ref={photoControl}
          type="button"
        >
          <Camera aria-hidden="true" />
          Прикрепить фото
        </button>
        <input
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          aria-label="Прикрепить фото"
          id="parts-request-photo"
          onChange={(event) => changeFile("photo", event)}
          ref={photoInput}
          type="file"
        />
        <button className="button button--ghost" onClick={clearDraft} type="button">
          <Trash2 aria-hidden="true" />
          Очистить
        </button>
      </div>
      <p className="parts-request__hint">
        Excel: XLS, XLSX или CSV до {readableSize(MAX_SPREADSHEET_BYTES)}. Фото: JPG,
        PNG или WebP до {readableSize(MAX_PHOTO_BYTES)}.
      </p>
      <Attachment file={spreadsheet} onRemove={() => removeFile("spreadsheet")} />
      <Attachment file={photo} onRemove={() => removeFile("photo")} />
      <div className="parts-request__contact-fields">
        <label>
          Имя
          <input autoComplete="name" maxLength={100} name="name" required />
        </label>
        <label>
          Телефон
          <input autoComplete="tel" inputMode="tel" maxLength={40} name="phone" required />
        </label>
        <label>
          Email
          <input autoComplete="email" maxLength={254} name="email" type="email" />
        </label>
      </div>
      <label className="lead-form__honeypot" aria-hidden="true">
        Сайт
        <input autoComplete="off" name="website" tabIndex={-1} />
      </label>
      <label className="lead-form__consent">
        <input name="consent" required type="checkbox" />
        <span>
          Согласен с <Link href="/privacy-policy">политикой конфиденциальности</Link>
        </span>
      </label>
      <MarketingConsent />
      <TurnstileField ref={turnstile} />
      <button className="button button--accent" disabled={state === "sending"} type="submit">
        <Upload aria-hidden="true" />
        {state === "sending" ? "Отправляем…" : "Отправить список на расчёт"}
      </button>
      {error ? <p className="parts-request__error" role="alert">{error}</p> : null}
    </form>
  );
}

function Attachment({ file, onRemove }: { file: File | null; onRemove: () => void }) {
  if (!file) return null;
  return (
    <div className="parts-request__file">
      <span>{file.name}</span>
      <small>{readableSize(file.size)}</small>
      <button aria-label={`Удалить ${file.name}`} onClick={onRemove} type="button">
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
