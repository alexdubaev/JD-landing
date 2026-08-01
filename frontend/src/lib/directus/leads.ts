import "server-only";

import type { PartsRequestItem } from "@/lib/leads/parts-request";
import type { LeadInput } from "@/lib/leads/schema";

import { directusRequest } from "./client";

const leadAttachmentFolderId = "20fe4272-2f18-4ec8-a52a-f0efce9bcef8";

const safeAttachmentName = (value: string) => {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/gu, "")
    .replace(/[\\/:*?"<>|]+/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 100);
  return sanitized || "attachment";
};

export async function uploadLeadAttachment(file: File): Promise<string> {
  const name = safeAttachmentName(file.name);
  const form = new FormData();
  form.set("file", file, name);
  form.set("folder", leadAttachmentFolderId);
  form.set("title", `Заявка: ${name}`.slice(0, 128));
  const uploaded = await directusRequest<{ id: string }>("/files", {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  return uploaded.id;
}

export async function deleteLeadAttachment(id: string): Promise<void> {
  await directusRequest<void>(`/files/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
  });
}

export async function createLead(
  input: LeadInput,
  options: {
    attachments?: string[];
    requestItems?: PartsRequestItem[];
  } = {},
): Promise<void> {
  await directusRequest<{ id: string }>("/items/leads", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      message: input.message ?? null,
      product: input.product ?? null,
      category: input.category ?? null,
      page_url: input.page_url ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_content: input.utm_content ?? null,
      utm_term: input.utm_term ?? null,
      request_items: options.requestItems ?? input.request_items ?? null,
      attachments: options.attachments ?? null,
      status: "new",
    }),
    cache: "no-store",
  });
}
