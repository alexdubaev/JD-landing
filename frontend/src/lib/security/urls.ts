const SAFE_PROTOCOLS = new Set(["https:", "mailto:", "tel:"]);

export function safeUrl(
  raw: string | null | undefined,
  fallback: string | null = null,
): string | null {
  const value = raw?.trim();
  if (!value) return fallback;

  if (value.startsWith("/")) {
    return value.startsWith("//") ? fallback : value;
  }

  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function safeSameOriginPath(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
