import { NextResponse } from "next/server";

import { createLead } from "@/lib/directus/leads";
import { leadSchema } from "@/lib/leads/schema";

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
  try {
    const parsed = leadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Проверьте заполнение формы" },
        { status: 400 },
      );
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

    await createLead(parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Не удалось отправить заявку. Попробуйте ещё раз." },
      { status: 503 },
    );
  }
}
