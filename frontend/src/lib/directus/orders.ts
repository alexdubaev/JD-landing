import "server-only";

import type { OrderInput } from "@/lib/orders/schema";
import { MARKETING_CONSENT_VERSION } from "@/lib/marketing/consent";

import { directusRequest } from "./client";

type CreatedOrder = { id: string };

type RawOrderItem = {
  id: string;
};

/**
 * Create an order together with its line items. Items are snapshotted from the
 * cart so the historical record stays accurate even if a product later changes
 * its price/SKU or is deleted.
 *
 * If the line-item write fails after the order row exists, the order is
 * deleted right here (compensating delete) and the error is rethrown, so no
 * orphaned half-orders remain even though the API route never learns the id.
 */
export async function createOrder(
  input: OrderInput,
): Promise<{ id: string }> {
  const total = input.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0,
  );
  const marketingConsentAt = input.marketing_consent
    ? new Date().toISOString()
    : null;

  const order = await directusRequest<CreatedOrder>("/items/orders", {
    method: "POST",
    body: JSON.stringify({
      customer_name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      comment: input.comment ?? null,
      total: Number(total.toFixed(2)),
      currency: "RUB",
      page_url: input.page_url ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_content: input.utm_content ?? null,
      utm_term: input.utm_term ?? null,
      marketing_consent: input.marketing_consent,
      marketing_consent_at: marketingConsentAt,
      marketing_consent_version: input.marketing_consent
        ? MARKETING_CONSENT_VERSION
        : null,
      status: "new",
    }),
    cache: "no-store",
  });

  // One batch POST writes all line items in a single round-trip (Directus
  // accepts an array body on /items/<collection>; verified against the live
  // 12.1.1 instance). On failure the catch below compensates by deleting the
  // order — the FK cascade removes whatever the batch managed to write.
  try {
    await directusRequest<RawOrderItem[]>("/items/order_items", {
      method: "POST",
      body: JSON.stringify(
        input.items.map((item) => ({
          order: order.id,
          product: item.product ?? null,
          sku_snapshot: item.sku,
          title_snapshot: item.title,
          unit_price: Number(item.unit_price.toFixed(2)),
          quantity: item.quantity,
          currency: "RUB",
        })),
      ),
      cache: "no-store",
    });
  } catch (error) {
    // Best-effort rollback: a failed delete must not mask the original error.
    await deleteOrder(order.id).catch(() => undefined);
    throw error;
  }

  return { id: order.id };
}

export async function deleteOrder(id: string): Promise<void> {
  // CASCADE on order_items.order removes the children automatically.
  await directusRequest<void>(`/items/orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
  });
}
