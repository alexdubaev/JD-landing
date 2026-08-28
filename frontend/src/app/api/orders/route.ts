import { NextResponse } from "next/server";

import { DirectusRequestError } from "@/lib/directus/client";
import { createOrder, deleteOrder } from "@/lib/directus/orders";
import { orderSchema } from "@/lib/orders/schema";
import {
  RequestTooLargeError,
  getTrustedClientIp,
  readBodyWithinLimit,
} from "@/lib/security/request";
import { verifyTurnstile } from "@/lib/security/turnstile";

const MAX_ORDER_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MB is plenty for JSON line items.

class OrderValidationError extends Error {}

export async function POST(request: Request) {
  let createdOrderId: string | null = null;
  try {
    const boundedBody = await readBodyWithinLimit(
      request,
      MAX_ORDER_REQUEST_BYTES,
    );
    const boundedRequest = request.body
      ? new Request(request.url, {
          method: request.method,
          headers: (() => {
            const headers = new Headers(request.headers);
            headers.delete("content-length");
            return headers;
          })(),
          body: boundedBody.buffer.slice(
            boundedBody.byteOffset,
            boundedBody.byteOffset + boundedBody.byteLength,
          ) as ArrayBuffer,
        })
      : request;
    const input: unknown = await boundedRequest.json();
    const parsed = orderSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrderValidationError();
    }

    if (
      !(await verifyTurnstile({
        token: parsed.data.turnstile_token,
        remoteIp: getTrustedClientIp(request.headers),
      }))
    ) {
      return NextResponse.json(
        { error: "Не удалось подтвердить отправку" },
        { status: 400 },
      );
    }

    const order = await createOrder(parsed.data);
    createdOrderId = order.id;

    return NextResponse.json({ ok: true, order_id: order.id }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return NextResponse.json(
        { error: "Размер запроса превышает допустимый лимит." },
        { status: 413 },
      );
    }
    if (createdOrderId) {
      // Compensating delete: if line items failed mid-way, drop the order
      // entirely so no orphaned half-orders remain.
      await deleteOrder(createdOrderId).catch(() => undefined);
    }
    if (
      error instanceof OrderValidationError ||
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        { error: "Проверьте заполнение формы" },
        { status: 400 },
      );
    }
    // A Directus outage must be visible in the logs, not just a faceless 503.
    console.error(
      "[orders] submit failed",
      error instanceof DirectusRequestError
        ? { status: error.status, path: error.path }
        : error,
    );
    return NextResponse.json(
      { error: "Не удалось оформить заказ. Попробуйте ещё раз." },
      { status: 503 },
    );
  }
}
