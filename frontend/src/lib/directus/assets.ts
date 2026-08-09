export type AssetTransform = Record<string, number | string>;

export function directusAssetUrl(
  id: string | null | undefined,
  transforms: AssetTransform = {},
): string | null {
  if (!id) return null;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(transforms).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    search.set(key, String(value));
  }

  const query = search.toString();
  return `/media/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}
