import "server-only";

import type { LeadInput } from "@/lib/leads/schema";

import { directusRequest } from "./client";

export async function createLead(input: LeadInput): Promise<void> {
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
      status: "new",
    }),
    cache: "no-store",
  });
}
