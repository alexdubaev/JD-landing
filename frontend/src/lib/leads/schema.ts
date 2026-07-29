import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

export const leadSchema = z
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
    turnstile_token: optionalText(2048),
    website: z.string().max(0).optional().default(""),
  })
  .strict();

export type LeadInput = z.infer<typeof leadSchema>;
