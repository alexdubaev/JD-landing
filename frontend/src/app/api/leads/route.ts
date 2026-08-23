import { NextResponse } from "next/server";

import {
  createLead,
  deleteLeadAttachment,
  uploadLeadAttachment,
} from "@/lib/directus/leads";
import {
  normalizePartsRequestItems,
  type PartsRequestItem,
} from "@/lib/leads/parts-request";
import {
  validateLeadAttachment,
  type AttachmentKind,
} from "@/lib/leads/attachments";
import { leadSchema } from "@/lib/leads/schema";
import { notifyNewLead } from "@/lib/notifications/notify";

const MAX_LEAD_REQUEST_BYTES = 20 * 1024 * 1024;

class LeadValidationError extends Error {}

async function isHuman(token: string | undefined, remoteIp: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form, cache: "no-store" },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

const stringValue = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
};

const fileValue = (form: FormData, name: string) => {
  const value = form.get(name);
  return value !== null && typeof value !== "string" && value.size > 0
    ? (value as File)
    : null;
};

function parseRequestItems(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new LeadValidationError();
    return parsed as PartsRequestItem[];
  } catch {
    throw new LeadValidationError();
  }
}

function attachmentError(files: Array<[AttachmentKind, File | null]>) {
  return files.reduce<string | null>(
    (error, [kind, file]) => error ?? validateLeadAttachment(kind, file),
    null,
  );
}

export async function POST(request: Request) {
  const uploadedIds: string[] = [];
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_LEAD_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Размер запроса превышает допустимый лимит." },
        { status: 413 },
      );
    }
    const isMultipart = request.headers
      .get("content-type")
      ?.toLocaleLowerCase("en")
      .includes("multipart/form-data");
    if (isMultipart && (!Number.isFinite(contentLength) || contentLength <= 0)) {
      return NextResponse.json(
        { error: "Для загрузки файлов требуется известный размер запроса." },
        { status: 411 },
      );
    }
    const form = isMultipart ? await request.formData() : null;
    const input = form
      ? {
          name: stringValue(form, "name"),
          phone: stringValue(form, "phone"),
          email: stringValue(form, "email"),
          message: stringValue(form, "message"),
          product: stringValue(form, "product"),
          category: stringValue(form, "category"),
          page_url: stringValue(form, "page_url"),
          utm_source: stringValue(form, "utm_source"),
          utm_medium: stringValue(form, "utm_medium"),
          utm_campaign: stringValue(form, "utm_campaign"),
          utm_content: stringValue(form, "utm_content"),
          utm_term: stringValue(form, "utm_term"),
          marketing_consent: form.has("marketing_consent"),
          turnstile_token: stringValue(form, "turnstile_token"),
          website: stringValue(form, "website"),
          request_items: parseRequestItems(stringValue(form, "request_items")),
        }
      : await request.json();
    const parsed = leadSchema.safeParse(input);
    if (!parsed.success) {
      throw new LeadValidationError();
    }

    const spreadsheet = form ? fileValue(form, "spreadsheet") : null;
    const photo = form ? fileValue(form, "photo") : null;
    const fileError = attachmentError([
      ["spreadsheet", spreadsheet],
      ["photo", photo],
    ]);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }
    if (form && !parsed.data.request_items?.length && !spreadsheet && !photo) {
      throw new LeadValidationError();
    }
    if (
      !(await isHuman(
        parsed.data.turnstile_token,
        request.headers.get("x-forwarded-for"),
      ))
    ) {
      return NextResponse.json(
        { error: "Не удалось подтвердить отправку" },
        { status: 400 },
      );
    }

    for (const file of [spreadsheet, photo]) {
      if (file) uploadedIds.push(await uploadLeadAttachment(file));
    }
    await createLead(parsed.data, {
      attachments: uploadedIds,
      requestItems: parsed.data.request_items
        ? normalizePartsRequestItems(parsed.data.request_items)
        : undefined,
    });
    // Best-effort manager notification: a mail outage must never affect the
    // visitor's lead, so the result is ignored here. Notifications are silent
    // when SMTP env vars are not configured (see lib/notifications/env.ts).
    await notifyNewLead({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      message: parsed.data.message,
      product: parsed.data.product,
      category: parsed.data.category,
      pageUrl: parsed.data.page_url,
      utm: {
        source: parsed.data.utm_source,
        medium: parsed.data.utm_medium,
        campaign: parsed.data.utm_campaign,
        content: parsed.data.utm_content,
        term: parsed.data.utm_term,
      },
      requestItems: parsed.data.request_items
        ? normalizePartsRequestItems(parsed.data.request_items)
        : undefined,
      attachments: uploadedIds.length ? uploadedIds : undefined,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (uploadedIds.length) {
      await Promise.allSettled(uploadedIds.map(deleteLeadAttachment));
    }
    if (error instanceof LeadValidationError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Проверьте заполнение формы" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Не удалось отправить заявку. Попробуйте ещё раз." },
      { status: 503 },
    );
  }
}
