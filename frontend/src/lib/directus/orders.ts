import "server-only";

import type { OrderInput } from "@/lib/orders/schema";
import { MARKETING_CONSENT_VERSION } from "@/lib/marketing/consent";

import { directusRequest } from "./client";

type CreatedOrder = { id: string };

type RawOrderItem = {
  id: string;
};

type RawOrderProduct = {
  id: string;
  status: string;
  title: string;
  sku: string;
  price: string | number | null;
  currency: string;
  price_status: string;
};

type OrderLineSnapshot = {
  product: string;
  sku: string;
  title: string;
  unitPriceCents: number;
  quantity: number;
};

const MAX_DIRECTUS_DECIMAL_CENTS = 999_999_999_999;

export class OrderAmountOutOfRangeError extends Error {
  constructor() {
    super("Order amount cannot be represented by Directus decimal(12,2)");
    this.name = "OrderAmountOutOfRangeError";
  }
}

export class UnavailableOrderItemsError extends Error {
  constructor() {
    super("One or more products are unavailable for cart checkout");
    this.name = "UnavailableOrderItemsError";
  }
}

async function getOrderLineSnapshots(
  input: OrderInput,
): Promise<OrderLineSnapshot[]> {
  const ids = input.items.map((item) => item.product);
  const query = new URLSearchParams({
    "filter[status][_eq]": "published",
    "filter[id][_in]": ids.join(","),
    fields: "id,status,title,sku,price,currency,price_status",
    limit: String(ids.length),
  });
  const products = await directusRequest<RawOrderProduct[]>(
    `/items/products?${query.toString()}`,
    { cache: "no-store" },
  );
  const byId = new Map(products.map((product) => [product.id, product]));

  return input.items.map((item) => {
    const product = byId.get(item.product);
    const price = typeof product?.price === "number"
      ? product.price
      : typeof product?.price === "string" && product.price.trim() !== ""
        ? Number(product.price)
        : Number.NaN;
    if (
      !product ||
      product.status !== "published" ||
      product.price_status !== "fixed" ||
      product.currency !== "RUB" ||
      !Number.isFinite(price) ||
      price < 0 ||
      !product.title.trim() ||
      !product.sku.trim()
    ) {
      throw new UnavailableOrderItemsError();
    }
    const priceParts = String(product.price).trim().match(/^(\d+)(?:\.(\d+))?$/u);
    const fractionalDigits = priceParts?.[2] ?? "";
    if (
      !priceParts ||
      /[1-9]/u.test(fractionalDigits.slice(2))
    ) {
      throw new OrderAmountOutOfRangeError();
    }
    const wholeCents = Number(priceParts[1]) * 100;
    const fractionalCents = Number(fractionalDigits.slice(0, 2).padEnd(2, "0"));
    const unitPriceCents = wholeCents + fractionalCents;
    if (
      !Number.isSafeInteger(unitPriceCents) ||
      unitPriceCents > MAX_DIRECTUS_DECIMAL_CENTS
    ) {
      throw new OrderAmountOutOfRangeError();
    }
    return {
      product: product.id,
      sku: product.sku,
      title: product.title,
      unitPriceCents,
      quantity: item.quantity,
    };
  });
}

/**
 * Create an order with fresh snapshots from published Directus products.
 *
 * If the line-item write fails after the order row exists, the order is
 * deleted right here (compensating delete) and the error is rethrown, so no
 * orphaned half-orders remain even though the API route never learns the id.
 */
export async function createOrder(
  input: OrderInput,
): Promise<{ id: string }> {
  // Read the complete product batch uncached and validate it before any write.
  const items = await getOrderLineSnapshots(input);
  let totalCents = 0;
  for (const item of items) {
    if (item.unitPriceCents > MAX_DIRECTUS_DECIMAL_CENTS / item.quantity) {
      throw new OrderAmountOutOfRangeError();
    }
    const lineTotalCents = item.unitPriceCents * item.quantity;
    if (totalCents > MAX_DIRECTUS_DECIMAL_CENTS - lineTotalCents) {
      throw new OrderAmountOutOfRangeError();
    }
    totalCents += lineTotalCents;
  }
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
      total: totalCents / 100,
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
        items.map((item) => ({
          order: order.id,
          product: item.product,
          sku_snapshot: item.sku,
          title_snapshot: item.title,
          unit_price: item.unitPriceCents / 100,
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
