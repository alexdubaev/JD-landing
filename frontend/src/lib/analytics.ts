export type AnalyticsEventName =
  | "article_open"
  | "category_view"
  | "email_click"
  | "excel_upload"
  | "faq_open"
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

declare global {
  interface Window {
    dataLayer?: AnalyticsEvent[];
  }
}

export function trackEvent(
  event: AnalyticsEventName,
  properties: Omit<AnalyticsEvent, "event"> = {},
) {
  if (typeof window === "undefined" || !Array.isArray(window.dataLayer)) return;
  window.dataLayer.push({ event, ...properties });
}
