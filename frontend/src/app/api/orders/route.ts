import { NextResponse } from "next/server";

import { createOrder, deleteOrder } from "@/lib/directus/orders";
import { orderSchema } from "@/lib/orders/schema";

const MAX_ORDER_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MB is plenty for JSON line items.

class OrderValidationError extends Error {}

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
    const parsed = orderSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrderValidationError();
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

    const order = await createOrder(parsed.data);
    createdOrderId = order.id;

    return NextResponse.json({ ok: true, order_id: order.id }, { status: 201 });
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
