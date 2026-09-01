import { z } from "zod";

import { MAX_PARTS_REQUEST_ITEMS } from "./parts-request";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((value) => value || undefined)
  .refine((value) => !value || value.length >= 7);

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((value) => value || undefined)
  .refine((value) => !value || z.email().safeParse(value).success);

const requestItemSchema = z.object({
  article: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .transform((value) => value.replace(/\s+/gu, "").toLocaleUpperCase("ru")),
  quantity: z.coerce.number().int().min(1).max(100_000),
});

export const leadSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(40),
    email: optionalEmail,
    message: optionalText(3000),
    product: optionalText(128),
    category: optionalText(128),
    page_url: optionalText(1000),
    utm_source: optionalText(200),
    utm_medium: optionalText(200),
    utm_campaign: optionalText(200),
    utm_content: optionalText(200),
    utm_term: optionalText(200),
    marketing_consent: z.boolean().optional().default(false),
    turnstile_token: optionalText(2048),
    request_items: z
      .array(requestItemSchema)
      .min(1)
      .max(MAX_PARTS_REQUEST_ITEMS)
      .optional(),
    website: z.string().max(0).optional().default(""),
  })
  .strict();

export type LeadInput = z.infer<typeof leadSchema>;

/**
 * Header contact messages are mail-only for now: the current Directus
 * `leads.phone` column is non-nullable, while this form accepts either contact.
 */
export const contactRequestSchema = z
  .object({
    submission_type: z.literal("contact"),
    name: z.string().trim().min(2).max(100),
    phone: optionalPhone,
    email: optionalEmail,
    message: z.string().trim().min(1).max(3000),
    page_url: optionalText(1000),
    utm_source: optionalText(200),
    utm_medium: optionalText(200),
    utm_campaign: optionalText(200),
    utm_content: optionalText(200),
    utm_term: optionalText(200),
    turnstile_token: optionalText(2048),
    website: z.string().max(0).optional().default(""),
  })
  .refine((value) => Boolean(value.phone || value.email), {
    message: "Укажите телефон или почту",
    path: ["phone"],
  })
  .strict();

export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
