export type AnalyticsEventName =
  | "article_open"
  | "category_view"
  | "email_click"
  | "excel_upload"
  | "faq_open"
  | "lead_form_open"
  | "lead_submit"
  | "messenger_click"
  | "order_submit"
  | "parts_list_paste"
  | "parts_request_cta"
  | "phone_click"
  | "photo_upload"
  | "product_add_to_cart"
  | "product_add_to_request"
  | "product_open"
  | "search_submit"
  | "search_use";

export type AnalyticsEvent = { event: AnalyticsEventName } & Record<
  string,
  string | number | boolean | undefined
>;

export const COOKIE_CONSENT_STORAGE_KEY = "deere-shop:cookie-consent";

declare global {
  interface Window {
    dataLayer?: AnalyticsEvent[];
  }
}

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function trackEvent(
  event: AnalyticsEventName,
  properties: Omit<AnalyticsEvent, "event"> = {},
) {
  if (
    !hasAnalyticsConsent() ||
    typeof window === "undefined" ||
    !Array.isArray(window.dataLayer)
  ) {
    return;
  }
  window.dataLayer.push({ event, ...properties });
}

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const UTM_STORAGE_KEY = "deere-shop:utm";

function readStoredUtm(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const stored: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (UTM_KEYS.includes(key as (typeof UTM_KEYS)[number]) && typeof value === "string" && value) {
        stored[key] = value;
      }
    }
    return stored;
  } catch {
    return {};
  }
}

/**
 * Remember utm params from the landing URL for the rest of the session, so
 * a lead submitted after in-site navigation still carries its source.
 * The last visit with utm params wins (last-click); a visit without them
 * keeps the stored attribution. Runs independently of analytics consent:
 * this attributes form fields the user themselves submitted, it is not
 * tracking. Call once per page load, before any form can be submitted.
 */
export function persistUtmOnce(): void {
  if (typeof window === "undefined") return;
  const fromUrl: Record<string, string> = {};
  const params = new URLSearchParams(window.location.search);
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) fromUrl[key] = value;
  }
  if (Object.keys(fromUrl).length === 0) return;
  try {
    window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl));
  } catch {
    // Storage may be unavailable (private mode); collect falls back to the URL.
  }
}

/**
 * UTM attribution for lead/order payloads: the current URL first, then the
 * values persisted on the session's landing page. Only non-empty values, so
 * forms never submit empty utm fields.
 */
export function collectUtmAttribution(): Record<string, string> {
  const attribution: Record<string, string> = {};
  if (typeof window === "undefined") return attribution;
  const params = new URLSearchParams(window.location.search);
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) attribution[key] = value;
  }
  if (Object.keys(attribution).length === 0) {
    return readStoredUtm();
  }
  return attribution;
}
