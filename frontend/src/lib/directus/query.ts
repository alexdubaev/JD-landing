import "server-only";

import { directusRequest } from "./client";

/** Directus file relation shape: a uuid, an expanded object, or nothing. */
export type FileRelation = string | { id: string } | null;

/** Extract the uuid from a file relation (or null). */
export const fileId = (relation: FileRelation | undefined) =>
  typeof relation === "string" ? relation : (relation?.id ?? null);

/** Extract the uuid from any m2o relation (or null). */
export const relationId = (
  relation: string | { id: string } | null | undefined,
) => (typeof relation === "string" ? relation : (relation?.id ?? null));

/**
 * Serialize filter/field params into a Directus query string, dropping
 * undefined and empty values. Shared by every catalog/articles/content
 * fetch so cache keys stay byte-identical for identical inputs.
 */
export const queryString = (parameters: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return search.toString();
};

/**
 * GET a Directus collection with ISR options — the one place that assembles
 * `<path>?<query>` so fetch caching stays consistent across modules.
 */
export async function fetchItems<T>(
  path: string,
  parameters: Record<string, string | undefined>,
  next: { revalidate: number; tags: string[] },
): Promise<T[]> {
  const items = await directusRequest<T[]>(`${path}?${queryString(parameters)}`, {
    next,
  });
  return Array.isArray(items) ? items : [];
}
