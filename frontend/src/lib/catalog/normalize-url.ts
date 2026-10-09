import legacyCatalogRedirects from "./legacy-product-redirects.json";

/** Return a redirect target for the narrowly scoped catalogue URL cleanups. */
export function normalizeCatalogUrl(url: URL): { href: string; status: 301 | 308 } | null {
  if (!url.pathname.startsWith("/catalog/") && url.pathname !== "/catalog") {
    return null;
  }

  const legacyTarget = legacyCatalogRedirects[url.pathname as keyof typeof legacyCatalogRedirects];
  const listingPath = url.pathname === "/catalog" ||
    (url.pathname.startsWith("/catalog/") && url.pathname.slice(1).split("/").length === 2);
  const pageOne = url.searchParams.get("page") === "1";
  const removedPageOne = (listingPath || legacyTarget !== undefined) && pageOne;
  if (legacyTarget === undefined && !removedPageOne) return null;

  const target = new URL(url);
  if (legacyTarget !== undefined) target.pathname = legacyTarget;
  if (removedPageOne) {
    target.searchParams.delete("page");
  }

  return { href: target.toString(), status: legacyTarget !== undefined ? 301 : 308 };
}
