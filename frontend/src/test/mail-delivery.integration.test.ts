// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
import { startSmtpFixture } from "./smtp-fixture";
import { POST as postLead } from "@/app/api/leads/route";
import { POST as postOrder } from "@/app/api/orders/route";
const productId = "11111111-1111-4111-8111-111111111111";

const decodeQuotedPrintable = (value: string) => Buffer.from(value.replace(/=\r?\n/gu, "").replace(/=([\da-f]{2})/giu, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "binary").toString("utf8");
describe("real local SMTP delivery", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("delivers contact and denied-CMS bulk leads with the original MIME attachment", async () => {
    const smtp = await startSmtpFixture();
    vi.stubEnv("SMTP_HOST", "127.0.0.1"); vi.stubEnv("SMTP_PORT", String(smtp.port));
    vi.stubEnv("SMTP_SECURE", "false"); vi.stubEnv("SMTP_USER", "sender@example.test");
    vi.stubEnv("SMTP_PASSWORD", "synthetic-password"); vi.stubEnv("NOTIFY_EMAIL_TO", "recipient@example.test");
    vi.stubEnv("DIRECTUS_URL", "https://cms.invalid"); vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv("DIRECTUS_PUBLIC_FOLDER_ID", "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://cms.invalid")) {
        if (url.includes("/items/products?")) return Response.json({ data: [{ id: productId, status: "published", title: "Муфта из CMS", sku: "RE504836", price: "100.25", currency: "RUB", price_status: "fixed" }] });
        if (url.endsWith("/items/orders")) return Response.json({ data: { id: "synthetic-order-42" } });
        if (url.endsWith("/items/order_items")) return Response.json({ data: [{ id: "synthetic-line" }] });
        return new Response("forbidden", { status: 403 });
      }
      throw new Error(`Unexpected external fetch in SMTP integration test: ${url}`);
    }));
    try {
      const contact = await postLead(new Request("https://example.test/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submission_type: "contact", name: "Иван", email: "ivan@example.test", message: "Условия поставки", website: "" }) }));
      expect(contact.status).toBe(201);
      const form = new FormData(); form.set("name", "Иван"); form.set("phone", "+7 900 000-00-00"); form.set("website", "");
      form.set("spreadsheet", new NodeFile(["article,quantity\nRE504836,2"], "parts.csv", { type: "text/csv" }) as unknown as Blob);
      const bulk = await postLead(new Request("https://example.test/api/leads", { method: "POST", body: form }));
      expect(bulk.status).toBe(201);
      expect(smtp.messages).toHaveLength(2);
      expect(decodeQuotedPrintable(smtp.messages[0])).toContain("Условия поставки");
      expect(smtp.messages[1]).toContain("Content-Disposition: attachment");
      expect(smtp.messages[1]).toContain("parts.csv");
      expect(smtp.messages[1]).toContain(Buffer.from("article,quantity\nRE504836,2").toString("base64"));
      expect(decodeQuotedPrintable(smtp.messages[1])).toContain("не подтверждено");
      const order = await postOrder(new Request("https://example.test/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Иван", phone: "+7 900 000-00-00", email: "ivan@example.test", comment: "Позвонить после 18:00", page_url: "https://example.test/cart", utm_source: "yandex", items: [{ product: productId, sku: "CLIENT-FAKE", title: "Поддельное имя", unit_price: 0.01, quantity: 2 }], website: "" }) }));
      expect(order.status).toBe(201);
      expect(smtp.messages).toHaveLength(3);
      expect(decodeQuotedPrintable(smtp.messages[2])).toContain("Заказ synthetic-order-42");
      expect(decodeQuotedPrintable(smtp.messages[2])).toContain("Муфта из CMS");
      expect(smtp.messages[2]).toContain("RE504836");
      expect(smtp.messages[2]).not.toContain("Поддельное имя");
      expect(decodeQuotedPrintable(smtp.messages[2])).toContain("200.50 RUB");
      expect(decodeQuotedPrintable(smtp.messages[2])).toContain("Позвонить после 18:00");
      expect(decodeQuotedPrintable(smtp.messages[2])).toContain("https://example.test/cart");
      expect(decodeQuotedPrintable(smtp.messages[2])).toContain("source=yandex");
    } finally { await smtp.close(); }
  });
});
