import { NextResponse } from "next/server";

import { createOrder, deleteOrder } from "@/lib/directus/orders";
import { createOrderSchema } from "@/lib/orders/schema";
import { getTrustedClientIp } from "@/lib/security/request";
import { verifyTurnstile } from "@/lib/security/turnstile";

const MAX_ORDER_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MB is plenty for JSON line items.

class OrderValidationError extends Error {}

export async function POST(request: Request) {
  let createdOrderId: string | null = null;
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_ORDER_REQUEST_BYTES
    ) {
      return NextResponse.json(
        { error: "Размер запроса превышает допустимый лимит." },
        { status: 413 },
      );
    }

    const input: unknown = await request.json();
    const parsed = createOrderSchema(process.env.NODE_ENV).safeParse(input);
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

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
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
    return NextResponse.json(
      { error: "Не удалось оформить заказ. Попробуйте ещё раз." },
      { status: 503 },
    );
  }
}
