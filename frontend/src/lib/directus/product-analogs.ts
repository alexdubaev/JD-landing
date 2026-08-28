import "server-only";

import type {
  ProductAnalogItem,
  ProductAnalogsView,
  ProductRelationType,
} from "@/types/catalog";

import { getProductsByIds } from "./catalog";
import { directusRequest } from "./client";
import { queryString, relationId } from "./query";

// ---------------------------------------------------------------------------
// Product analogs dual-read (R8)
// ---------------------------------------------------------------------------

/**
 * Bounded per-product edge read size. NEVER use limit=-1: a hub product must
 * not turn into an unbounded junction response.
 */
const PRODUCT_ANALOGS_LIMIT = 100;

type RawProductAnalogRow = {
  product_from: string | { id: string } | null;
  product_to: string | { id: string } | null;
  relation_type: string | null;
  source_name: string | null;
  note: string | null;
  verified_at: string | null;
};

const isProductRelationType = (
  value: unknown,
): value is ProductRelationType =>
  value === "analog" ||
  value === "oem_cross" ||
  value === "compatible" ||
  value === "superseded_by";

/**
 * Reads the typed relation edges of ONE product from `products_analogs` (both
 * sides for the symmetric types; only the outgoing side of `superseded_by` —
 * the incoming "заменяет..." side is dropped and never rendered) and hydrates
 * the other endpoints into published product cards.
 *
 * Errors degrade to the EMPTY view (the R7A resilience contract): a missing
 * collection or a public-role permission gap must never break an existing
 * product route — the legacy `related_products` fallback still renders,
 * because an empty analog view never shadows non-empty legacy data.
 */
export async function fetchProductAnalogs(
  productId: string,
): Promise<ProductAnalogsView> {
  try {
    const query = queryString({
      "filter[_or][0][product_from][_eq]": productId,
      "filter[_or][1][product_to][_eq]": productId,
      fields: "product_from,product_to,relation_type,source_name,note,verified_at",
      sort: "relation_type,id",
      limit: String(PRODUCT_ANALOGS_LIMIT),
    });
    const rows = await directusRequest<RawProductAnalogRow[]>(
      `/items/products_analogs?${query}`,
      { next: { revalidate: 300, tags: ["products"] } },
    );

    const edges = (Array.isArray(rows) ? rows : [])
      .flatMap((row): {
        relationType: ProductRelationType;
        direction: "from" | "to";
        otherProductId: string;
        sourceName: string | null;
        note: string | null;
        verifiedAt: string | null;
      }[] => {
        const from = relationId(row?.product_from);
        const to = relationId(row?.product_to);
        if (!from || !to || !isProductRelationType(row?.relation_type)) return [];
        const direction: "from" | "to" = from === productId ? "from" : "to";
        // Only the OUTGOING supersession is rendered ("этот артикул заменён
        // на..."); the reversed edge stays unrendered by contract.
        if (row.relation_type === "superseded_by" && direction === "to") return [];
        const otherProductId = direction === "from" ? to : from;
        if (otherProductId === productId) return []; // self-edge guard
        return [
          {
            relationType: row.relation_type,
            direction,
            otherProductId,
            sourceName: row.source_name?.trim() || null,
            note: row.note?.trim() || null,
            verifiedAt: row.verified_at ?? null,
          },
        ];
      });

    const hydrated = await getProductsByIds(
      edges.map(({ otherProductId }) => otherProductId),
    );
    const cardsById = new Map(hydrated.map((product) => [product.id, product]));
    const items: ProductAnalogItem[] = edges.flatMap(
      ({ otherProductId, ...edge }) => {
        const product = cardsById.get(otherProductId);
        return product ? [{ ...edge, product }] : [];
      },
    );

    return {
      analogs: items.filter((item) => item.relationType !== "superseded_by"),
      supersededBy: items.filter(
        (item) => item.relationType === "superseded_by",
      ),
    };
  } catch {
    return { analogs: [], supersededBy: [] };
  }
}
