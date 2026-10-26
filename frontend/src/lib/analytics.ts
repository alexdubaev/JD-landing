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

type AnalyticsProviders = { metricaId: string | null; gtmId: string | null };
type Goal = { event: AnalyticsEventName; properties: Omit<AnalyticsEvent, "event"> };

declare global {
  interface Window {
    dataLayer?: AnalyticsEvent[];
    ym?: (...args: unknown[]) => void;
    __jdMetricaInitialized?: Record<string, boolean>;
    __jdFlushMetricaGoals?: () => void;
  }
}

let providers: AnalyticsProviders = { metricaId: null, gtmId: null };
let pendingMetricaGoals: Goal[] = [];
let inMemoryAnalyticsConsent: boolean | null = null;

/** Keep the visitor's current-page choice effective when browser storage is blocked. */
export function setAnalyticsConsent(allowed: boolean | null): void {
  inMemoryAnalyticsConsent = allowed;
}

function validMetricaId(value: string | null): string | null {
  return value && /^\d{1,20}$/.test(value) ? value : null;
}

function validGtmId(value: string | null): string | null {
  return value && /^GTM-[A-Z0-9]+$/.test(value) ? value : null;
}

/** Configure allowed destinations after a consent choice. Invalid CMS IDs are ignored. */
export function configureAnalyticsProviders(input: AnalyticsProviders): void {
  const nextProviders = {
    metricaId: validMetricaId(input.metricaId),
    gtmId: validGtmId(input.gtmId),
  };
  // Pending goals belong to the counter active when they were recorded. Drop
  // them on counter changes so they can never be attributed to a new counter.
  if (providers.metricaId !== nextProviders.metricaId) pendingMetricaGoals = [];
  providers = nextProviders;
  if (!providers.metricaId) pendingMetricaGoals = [];
  if (providers.gtmId && typeof window !== "undefined") {
    window.dataLayer = window.dataLayer ?? [];
  }
  if (typeof window !== "undefined") window.__jdFlushMetricaGoals = flushMetricaEvents;
}

/** Flush once Metrica's queueing stub is available; init is queued before this call. */
export function flushMetricaEvents(): void {
  if (
    !providers.metricaId ||
    !hasAnalyticsConsent() ||
    typeof window === "undefined" ||
    typeof window.ym !== "function" ||
    !window.__jdMetricaInitialized?.[providers.metricaId]
  ) return;
  const queued = pendingMetricaGoals;
  pendingMetricaGoals = [];
  for (const goal of queued) {
    window.ym(providers.metricaId, "reachGoal", goal.event, goal.properties);
  }
}

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const storedConsent = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (storedConsent === "accepted") return true;
    if (storedConsent === "declined") return false;
    return inMemoryAnalyticsConsent === true;
  } catch {
    return inMemoryAnalyticsConsent === true;
  }
}

export function trackEvent(
  event: AnalyticsEventName,
  properties: Omit<AnalyticsEvent, "event"> = {},
) {
  if (!hasAnalyticsConsent() || typeof window === "undefined") return;
  if (providers.gtmId || Array.isArray(window.dataLayer)) {
    if (providers.gtmId) window.dataLayer = window.dataLayer ?? [];
    if (!Array.isArray(window.dataLayer)) return;
    window.dataLayer.push({ event, ...properties });
  }
  if (!providers.metricaId) return;
  if (
    typeof window.ym === "function" &&
    window.__jdMetricaInitialized?.[providers.metricaId]
  ) {
    window.ym(providers.metricaId, "reachGoal", event, properties);
  } else {
    if (pendingMetricaGoals.length < 100) pendingMetricaGoals.push({ event, properties });
  }
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
