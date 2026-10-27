import "server-only";

import type { PartsRequestItem } from "@/lib/leads/parts-request";

import { getSmtpEnv, type CompleteSmtpEnv } from "./env";
import { renderLeadEmail, renderOrderEmail, type LeadEmailModel } from "./render";
import type { OrderNotificationSnapshot } from "@/lib/directus/orders";

export type { LeadEmailModel };

/**
 * Full context available when a new lead is created. Everything except `name`
 * and `phone` is optional, mirroring the validated LeadInput.
 */
export type NewLeadPayload = {
  name: string;
  phone?: string;
  email?: string;
  message?: string;
  product?: string;
  category?: string;
  pageUrl?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  requestItems?: PartsRequestItem[];
  attachments?: string[];
  storedInDirectus?: boolean;
  notificationKind?: "contact";
  emailAttachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

const safeAttachmentName = (name: string) => name.normalize("NFKC").replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/gu, "_").replace(/^\.+/u, "file").trim().slice(0, 100) || "attachment";

const escapeHtml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");

const textRow = (label: string, value: string | undefined) =>
  value ? `${label}: ${value}\n` : "";

/**
 * Lazily create a nodemailer transport. Importing nodemailer dynamically keeps
 * it out of bundles that never send mail, and lets tests stub the transport
 * without loading the real module.
 */
async function createTransport(env: CompleteSmtpEnv) {
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    // A hung SMTP connection must never stall the lead route that awaits
    // this send.
    connectionTimeout: 5_000,
    socketTimeout: 5_000,
  });
}

/**
 * Send a manager notification about a new lead. Best-effort: any error is
 * swallowed and logged, so a mail outage never affects the visitor's request.
 * Returns the resolved recipient when mail was attempted, or null when
 * notifications are disabled.
 */
export async function notifyNewLead(
  lead: NewLeadPayload,
): Promise<string | null> {
  try {
    const env = getSmtpEnv();
    if (!env) return null;
    const senderName = "DEERE-SHOP";
    const from = env.SMTP_FROM || env.SMTP_USER;
    const subject = lead.notificationKind === "contact"
      ? `Новое сообщение — ${lead.name}`
      : `${lead.storedInDirectus === false ? "Новая заявка (сохранение в Directus не подтверждено)" : "Новая заявка"} — ${lead.name}`;
    const text = renderLeadPlainText(lead);
    const html = renderLeadEmail(toEmailModel(lead));
    const transport = await createTransport(env);
    await transport.sendMail({
      from: `${senderName} <${from}>`,
      to: env.NOTIFY_EMAIL_TO,
      subject,
      text,
      html,
      attachments: lead.emailAttachments?.map((file) => ({ filename: safeAttachmentName(file.filename), content: file.content, contentType: file.contentType })),
    });
    return env.NOTIFY_EMAIL_TO;
  } catch (error) {
    console.error("[notifications] lead email failed", error);
    return null;
  }
}

export async function notifyOrder(snapshot: OrderNotificationSnapshot): Promise<string | null> {
  try {
    const env = getSmtpEnv();
    if (!env) return null;
    const senderName = "DEERE-SHOP";
    const rendered = renderOrderEmail({ ...snapshot, escape: escapeHtml });
    const transport = await createTransport(env);
    await transport.sendMail({ from: `${senderName} <${env.SMTP_FROM || env.SMTP_USER}>`, to: env.NOTIFY_EMAIL_TO, subject: `Заказ ${snapshot.id} — ${snapshot.name}`, ...rendered });
    return env.NOTIFY_EMAIL_TO;
  } catch (error) { console.error("[notifications] order email failed", error); return null; }
}

function toEmailModel(lead: NewLeadPayload): LeadEmailModel {
  return {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    message: lead.message,
    product: lead.product,
    category: lead.category,
    pageUrl: lead.pageUrl,
    utm: lead.utm,
    requestItems: lead.requestItems,
    attachmentCount: lead.emailAttachments?.length ?? lead.attachments?.length ?? 0,
    storedInDirectus: lead.storedInDirectus,
    contactRequest: lead.notificationKind === "contact",
    emailAttachments: lead.emailAttachments?.map(({ filename }) => ({ filename })),
    escape: escapeHtml,
  };
}

function renderLeadPlainText(lead: NewLeadPayload): string {
  const lines: string[] = [];
  lines.push(lead.notificationKind === "contact" ? "Поступило новое сообщение с сайта DEERE-SHOP.\n" : "Поступила новая заявка с сайта DEERE-SHOP.\n");
  lines.push(textRow("Имя", lead.name));
  lines.push(textRow("Телефон", lead.phone));
  lines.push(textRow("Email", lead.email));
  lines.push(textRow("Продукт", lead.product));
  lines.push(textRow("Категория", lead.category));
  lines.push(textRow("Сообщение", lead.message));
  lines.push(textRow("Страница", lead.pageUrl));

  if (lead.requestItems?.length) {
    lines.push("\nСписок запчастей:");
    for (const item of lead.requestItems) {
      lines.push(`  • ${item.article} — ${item.quantity} шт.`);
    }
  }

  const attachmentCount = lead.emailAttachments?.length ?? lead.attachments?.length ?? 0;
  if (attachmentCount) {
    lines.push(
      `\nВложения: ${attachmentCount} ${
        attachmentCount === 1 ? "файл" : "файлов"
      }${lead.storedInDirectus === false ? " приложены к письму; сохранение в Directus не подтверждено." : " доступны в Directus."}`,
    );
  }

  const utm = lead.utm;
  if (utm && (utm.source || utm.medium || utm.campaign)) {
    lines.push(
      `\nUTM: ${[utm.source, utm.medium, utm.campaign]
        .filter(Boolean)
        .join(" / ")}`,
    );
  }

  return lines.join("\n");
}
