import { z } from "zod";

export const MAX_ORDER_ITEMS = 100;

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

/**
 * A single order line item. Prices and titles are snapshotted at submission
 * time so historical orders stay accurate even if the product later changes
 * or is deleted.
 */
export const orderItemSchema = z.object({
  product: z.uuid().optional(),
  sku: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(500),
  unit_price: z.coerce.number().nonnegative().max(1_000_000_000),
  quantity: z.coerce.number().int().min(1).max(10_000),
});

export const orderSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(40),
    email: z.union([z.email(), z.literal(""), z.undefined()]).transform(
      (value) => value || undefined,
    ),
    comment: optionalText(2000),
    page_url: optionalText(1000),
    utm_source: optionalText(200),
    utm_medium: optionalText(200),
    utm_campaign: optionalText(200),
    utm_content: optionalText(200),
    utm_term: optionalText(200),
    marketing_consent: z.boolean().optional().default(false),
    turnstile_token: optionalText(2048),
    items: z.array(orderItemSchema).min(1).max(MAX_ORDER_ITEMS),
    website: z.string().max(0).optional().default(""),
  })
  .strict();

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
