/**
 * Temporary frontend contact configuration. These values will move to
 * Directus site settings when the admin-side content workflow is enabled.
 */
export const FRONTEND_CONTACT_EMAIL = "info@cmteh.ru";
export const FRONTEND_CONTACT_PHONES = ["8 911 921 22 14"] as const;

export function uniqueContactPhones(phone: string | null): string[] {
  return [...new Set([phone, ...FRONTEND_CONTACT_PHONES].filter(Boolean))] as string[];
}
