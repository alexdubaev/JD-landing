import type { PartsRequestItem } from "@/lib/leads/parts-request";

export type LeadEmailModel = {
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
  attachmentCount?: number;
  storedInDirectus?: boolean;
  escape: (value: string) => string;
};

const row = (label: string, value: string | undefined, escape: (v: string) => string) =>
  value
    ? `<tr><td class="label">${escape(label)}</td><td class="value">${escape(value)}</td></tr>`
    : "";

/**
 * Render a self-contained HTML email for a new-lead manager notification.
 * Uses inline styles only (email clients ignore <style> in many cases) and a
 * minimal palette consistent with the DEERE-SHOP brand.
 */
export function renderLeadEmail(model: LeadEmailModel): string {
  const { escape } = model;

  const rows = [
    row("Имя", model.name, escape),
    row("Телефон", model.phone, escape),
    row("Email", model.email, escape),
    row("Продукт", model.product, escape),
    row("Категория", model.category, escape),
    row("Сообщение", model.message, escape),
  ].join("");

  const requestItems = model.requestItems?.length
    ? `<tr><td colspan="2" class="section">Список запчастей</td></tr>
       <tr><td colspan="2"><ul>${model.requestItems
         .map(
           (item) =>
             `<li>${escape(item.article)} — ${escape(String(item.quantity))} шт.</li>`,
         )
         .join("")}</ul></td></tr>`
    : "";

  const attachments =
    model.attachmentCount && model.attachmentCount > 0
      ? `<tr><td colspan="2" class="note">Вложений: ${escape(
          String(model.attachmentCount),
        )} — доступны в админке Directus.</td></tr>`
      : "";

  const utmParts = ["source", "medium", "campaign", "content", "term"]
    .map((key) => {
      const value = model.utm?.[key as keyof NonNullable<typeof model.utm>];
      return value ? `${key}=${escape(value)}` : null;
    })
    .filter(Boolean);
  const utmRow = utmParts.length
    ? `<tr><td class="label">UTM</td><td class="value">${utmParts.join(", ")}</td></tr>`
    : "";

  const sourceRow = row("Страница", model.pageUrl, escape);

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#367c2b;padding:18px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.04em;">DEERE-SHOP</span>
          <span style="color:#ffd200;font-size:13px;margin-left:8px;">Новая заявка</span>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;font-size:15px;line-height:1.5;color:#3a3a3a;">
          Поступила новая заявка с сайта. Свяжитесь с клиентом в ближайшее время.
        </td></tr>
        <tr><td style="padding:12px 24px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
            ${rows}${sourceRow}${utmRow}${requestItems}${attachments}
          </table>
        </td></tr>
        <tr><td style="padding:12px 24px 20px;font-size:12px;color:#8a8a8a;">
          ${model.storedInDirectus === false ? "Это автоматическое уведомление с формы обратной связи." : "Это автоматическое уведомление. Ответлять на письмо не нужно — все данные сохранены в Directus."}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
