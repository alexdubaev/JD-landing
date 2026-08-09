/**
 * IndexNow ping helper.
 *
 * IndexNow is a protocol co-created by Yandex/Bing that lets a site notify
 * search engines the moment content changes, instead of waiting for the
 * crawler. When Directus triggers the revalidate webhook, we revalidate the
 * Next.js cache and then ping IndexNow with the affected URLs so Yandex
 * re-crawls within minutes.
 *
 * The key (`INDEXNOW_KEY`) must match a file served at
 * `/<INDEXNOW_KEY>.txt`. Next.js exposes it via the public folder.
 *
 * This helper is fault-tolerant: it must never break the revalidate webhook,
 * so any network/HTTP error is swallowed and logged via the callback.
 */

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const INDEXNOW_BATCH_LIMIT = 10000;

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
  const host = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
    : undefined;

  if (!key || !host) {
    // Not configured — skip silently. This is the expected state in dev.
    return;
  }

  const unique = Array.from(new Set(paths)).slice(0, INDEXNOW_BATCH_LIMIT);
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
      // Fire-and-forget semantics: don't keep the webhook waiting.
      cache: "no-store",
    });

    // 200 = submitted, 202 = accepted for processing. Both are success.
    if (!response.ok && response.status !== 202) {
      options.onError?.(
        `IndexNow ping failed: HTTP ${response.status}`,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    options.onError?.(`IndexNow ping error: ${detail}`);
  }
}
