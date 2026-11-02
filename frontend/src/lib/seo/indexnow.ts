/**
 * IndexNow ping helper.
 *
 * IndexNow is a protocol co-created by Yandex/Bing that lets a site notify
 * search engines the moment content changes, instead of waiting for the
 * crawler. When Directus triggers the revalidate webhook, we revalidate the
 * Next.js cache and then ping IndexNow with the affected URLs so Yandex
 * can discover the changed URLs. Submission does not guarantee indexing.
 *
 * The key (`INDEXNOW_KEY`) must match a file served at
 * `/<INDEXNOW_KEY>.txt`. Next.js exposes it via the public folder.
 *
 * This helper is fault-tolerant: it must never break the revalidate webhook,
 * so network/HTTP failures are bounded and logged without request secrets.
 */

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const INDEXNOW_BATCH_LIMIT = 10000;
const INDEXNOW_TIMEOUT_MS = 5000;

export type IndexNowOptions = {
  /** Called with a short human-readable message when something goes wrong. */
  onError?: (message: string) => void;
};

/** Returns true when IndexNow is configured (key + host are present). */
export function isIndexNowConfigured(): boolean {
  return Boolean(process.env.INDEXNOW_KEY && process.env.NEXT_PUBLIC_SITE_URL);
}

/**
 * Notify IndexNow that the given URL paths have changed.
 *
 * @param paths absolute site paths, e.g. "/catalog", "/catalog/tractors".
 * Accepts at most 10000 entries per the protocol; excess entries are dropped.
 */
export async function notifyIndexNow(
  paths: string[],
  options: IndexNowOptions = {},
): Promise<void> {
  const key = process.env.INDEXNOW_KEY;
  let host: string | undefined;
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      host = new URL(process.env.NEXT_PUBLIC_SITE_URL).host;
    } catch {
      // The revalidate webhook calls this after a successful cache flush;
      // a malformed site URL must degrade to a skipped ping, never a 500.
      console.warn(
        "[indexnow] invalid NEXT_PUBLIC_SITE_URL — ping skipped",
      );
      return;
    }
  }

  if (!key || !host) {
    // Not configured — skip silently. This is the expected state in dev.
    return;
  }

  // Only public, same-site paths: never send query strings or fragments that
  // could contain private data. Reject URL normalization tricks as well.
  const unique = Array.from(new Set(paths)).filter((path) => {
    if (!path.startsWith("/") || /[\\?#\s]/u.test(path)) return false;
    try {
      const url = new URL(path, `https://${host}`);
      return url.host === host && url.pathname === path;
    } catch {
      return false;
    }
  }).slice(0, INDEXNOW_BATCH_LIMIT);
  if (unique.length === 0) return;

  const body = {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: unique.map((path) => `https://${host}${path}`),
  };

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
    });

    // 202 still requires key verification; neither status confirms indexing.
    if (response.status === 200 || response.status === 202) {
      console.info("[indexnow] submission", {
        status: response.status,
        count: unique.length,
        outcome: response.status === 200 ? "submitted" : "key_verification_pending",
      });
    } else {
      const message = `IndexNow ping failed: HTTP ${response.status}`;
      console.warn("[indexnow] submission failed", { status: response.status, count: unique.length });
      options.onError?.(message);
    }
  } catch (error) {
    // Never log raw exceptions or response bodies: transports can embed keys.
    const timedOut = typeof error === "object" && error !== null && "name" in error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const message = timedOut ? "IndexNow ping timed out" : "IndexNow ping network error";
    console.warn("[indexnow] submission failed", { reason: timedOut ? "timeout" : "network", count: unique.length });
    options.onError?.(message);
  }
}
