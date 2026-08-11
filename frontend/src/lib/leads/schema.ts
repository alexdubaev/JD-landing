import { z } from "zod";

import { MAX_PARTS_REQUEST_ITEMS } from "./parts-request";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

const requestItemSchema = z.object({
  article: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .transform((value) => value.replace(/\s+/gu, "").toLocaleUpperCase("ru")),
  quantity: z.coerce.number().int().min(1).max(100_000),
});

export const createLeadSchema = (nodeEnv = process.env.NODE_ENV) =>
  z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(40),
    email: z.union([z.email(), z.literal(""), z.undefined()]).transform(
      (value) => value || undefined,
    ),
    message: optionalText(3000),
    product: optionalText(128),
    category: optionalText(128),
    page_url: optionalText(1000),
    utm_source: optionalText(200),
    utm_medium: optionalText(200),
    utm_campaign: optionalText(200),
    utm_content: optionalText(200),
    utm_term: optionalText(200),
    turnstile_token:
      nodeEnv === "production"
        ? z.string().trim().min(1).max(2048)
        : optionalText(2048),
    request_items: z
      .array(requestItemSchema)
      .min(1)
      .max(MAX_PARTS_REQUEST_ITEMS)
      .optional(),
    website: z.string().max(0).optional().default(""),
  })
  .strict();

export const leadSchema = createLeadSchema();

export type LeadInput = z.infer<typeof leadSchema>;
