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

/**
 * UTM attribution from the current URL for lead/order payloads — only
 * non-empty values, so forms never submit empty utm fields.
 */
export function collectUtmAttribution(): Record<string, string> {
  const attribution: Record<string, string> = {};
  if (typeof window === "undefined") return attribution;
  const params = new URLSearchParams(window.location.search);
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) attribution[key] = value;
  }
  return attribution;
}
