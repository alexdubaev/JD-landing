/**
 * Centralised URL helpers for SEO metadata, canonical URLs and JSON-LD.
 * All functions are safe to call in Server Components.
 */

export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru"
  ).replace(/\/+$/u, "");
}

/** Build an absolute URL from a path (relative to the site origin). */
export function absoluteUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${cleanPath}`;
}

/** Build an absolute URL with query parameters. */
export function absoluteUrlWithQuery(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${absoluteUrl(path)}?${query}` : absoluteUrl(path);
}