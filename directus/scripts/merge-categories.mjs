/**
 * Merges duplicate catalog categories into a single canonical category.
 *
 * Use case: the product import produced two near-identical categories
 * ("Крепёж" and "Крепёж и крепления"). This script:
 *   1. Locates both categories by slug.
 *   2. Picks the canonical one (more products wins, tie-break on slug order).
 *   3. Reassigns every product from the duplicate to the canonical category.
 *   4. Archives the duplicate (status = "archived") and records a
 *      `redirect_target` so the category page can permanentRedirect() to it.
 *
 * The script is idempotent: running it again after a merge is a no-op.
 * It runs in dry-run mode by default — pass `--apply` to write changes.
 *
 * Usage:
 *   node directus/scripts/merge-categories.mjs --from krepezh-i-krepleniya --to krepezh
 *   node directus/scripts/merge-categories.mjs --from krepezh-i-krepleniya --to krepezh --apply
 *
 * If --from/--to are omitted, it auto-detects the known "Крепёж" duplicate pair.
 */
import {
  DirectusAdminClient,
  isMainModule,
} from "../schema/apply-schema.mjs";

const KNOWN_DUPLICATE_PAIR = {
  canonicalSlug: "krepezh",
  duplicateSlug: "krepezh-i-krepleniya",
};

function parseArgs(argv) {
  const args = { apply: false, from: null, to: null };
  for (const token of argv.slice(2)) {
    if (token === "--apply") args.apply = true;
    else if (token.startsWith("--from=")) args.from = token.slice(7);
    else if (token.startsWith("--to=")) args.to = token.slice(5);
  }
  if (!args.from || !args.to) {
    args.from = KNOWN_DUPLICATE_PAIR.duplicateSlug;
    args.to = KNOWN_DUPLICATE_PAIR.canonicalSlug;
  }
  return args;
}

async function getCategory(client, slug) {
  const search = new URLSearchParams({
    "filter[slug][_eq]": slug,
    fields: "id,title,slug,status,redirect_target",
    limit: "1",
  });
  const items = await client.request(`/items/categories?${search.toString()}`);
  return items?.[0] ?? null;
}

async function countProducts(client, categoryId) {
  const search = new URLSearchParams({
    "filter[category][_eq]": categoryId,
    "filter[status][_neq]": "archived",
    fields: "id",
    limit: "1",
    meta: "filter_count",
  });
  const response = await fetch(
    `${client.baseUrl}/items/products?${search.toString()}`,
    {
      headers: { authorization: `Bearer ${client.token}` },
    },
  );
  const body = await response.json();
  return body?.meta?.filter_count ?? 0;
}

async function reassignProducts(client, fromId, toId, { apply }) {
  const search = new URLSearchParams({
    "filter[category][_eq]": fromId,
    fields: "id",
    limit: "-1",
  });
  const products = await client.request(
    `/items/products?${search.toString()}`,
  );
  if (!products?.length) {
    console.log(`  No products attached to duplicate ${fromId}.`);
    return 0;
  }
  if (!apply) {
    console.log(`  DRY RUN: would reassign ${products.length} products -> ${toId}`);
    return products.length;
  }
  const patchBody = JSON.stringify({ category: toId });
  for (const product of products) {
    await client.request(`/items/products/${product.id}`, {
      method: "PATCH",
      body: patchBody,
    });
  }
  console.log(`  Reassigned ${products.length} products -> ${toId}`);
  return products.length;
}

async function archiveDuplicate(client, duplicate, canonicalSlug, { apply }) {
  if (duplicate.status === "archived" && duplicate.redirect_target === canonicalSlug) {
    console.log("  Duplicate already archived and redirected. No change.");
    return;
  }
  if (!apply) {
    console.log(
      `  DRY RUN: would archive duplicate ${duplicate.slug} -> redirect to ${canonicalSlug}`,
    );
    return;
  }
  await client.request(`/items/categories/${duplicate.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "archived", redirect_target: canonicalSlug }),
  });
  console.log(`  Archived ${duplicate.slug} with redirect_target=${canonicalSlug}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const client = await DirectusAdminClient.connectFromEnvironment();

  console.log(`Merging category "${args.from}" -> "${args.to}" (${args.apply ? "APPLY" : "DRY RUN"})`);

  const canonical = await getCategory(client, args.to);
  const duplicate = await getCategory(client, args.from);

  if (!canonical) {
    throw new Error(`Canonical category "${args.to}" not found. Aborting.`);
  }
  if (!duplicate) {
    console.log(`Duplicate category "${args.from}" not found — nothing to merge.`);
    if (canonical.status === "archived") {
      console.log(`Canonical ${canonical.slug} is archived; republishing.`);
    }
    return;
  }
  if (canonical.id === duplicate.id) {
    throw new Error("Canonical and duplicate resolve to the same category. Check slugs.");
  }

  const canonicalCount = await countProducts(client, canonical.id);
  const duplicateCount = await countProducts(client, duplicate.id);
  console.log(`  Canonical "${canonical.title}" (${canonical.slug}): ${canonicalCount} products`);
  console.log(`  Duplicate "${duplicate.title}" (${duplicate.slug}): ${duplicateCount} products`);

  await reassignProducts(client, duplicate.id, canonical.id, args);
  await archiveDuplicate(client, duplicate, canonical.slug, args);

  console.log(args.apply ? "Merge complete." : "Dry run complete — re-run with --apply to write.");
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}

export { parseArgs, KNOWN_DUPLICATE_PAIR };
