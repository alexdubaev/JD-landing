// Task 9 (R5C) reconciliation: proves the article cutover state after apply.
// Per article: articles.content is byte-unchanged (sha256 vs before-state),
// content_blocks parses and passes the canonical document validation, and the
// articles_editor_nodes rows of the article match the plan exactly (no
// orphans, no missing relation junctions). Pure checks + thin CLI.

import { readFile } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  ARTICLE_SLUGS,
  extractRelationRefs,
  sha256Hex,
  validateContentDocument,
} from "./migrate-article-content.mjs";

const EDITOR_JUNCTION_COLLECTION = "articles_editor_nodes";

export async function reconcileArticleContent(client, { beforeState, plan }) {
  const violations = [];
  const articles = [];
  const plannedSlugs = new Set((plan?.articles ?? []).map(({ slug }) => slug));

  for (const row of beforeState) {
    const [article] = await client.request(
      `/items/articles/${encodeURIComponent(row.id)}?fields=id,slug,content,content_blocks`,
    );
    if (!article) {
      violations.push({ code: "missing-article", slug: row.slug });
      continue;
    }

    if (sha256Hex(article.content ?? "") !== row.content_sha256) {
      violations.push({ code: "content-changed", slug: row.slug });
    }

    let document = null;
    if (typeof article.content_blocks === "string") {
      try {
        document = JSON.parse(article.content_blocks);
      } catch {
        document = null;
      }
    } else if (article.content_blocks && typeof article.content_blocks === "object") {
      document = article.content_blocks;
    }

    if (!document || validateContentDocument(document).length > 0) {
      violations.push({ code: "invalid-content-blocks", slug: row.slug });
    }

    const junctionFilter = new URLSearchParams({
      "filter[articles_id][_eq]": article.id,
      fields: "id,collection,item",
      limit: "-1",
    });
    const junctions = await client.request(
      `/items/${EDITOR_JUNCTION_COLLECTION}?${junctionFilter.toString()}`,
    );
    const junctionIds = junctions.map(({ id }) => id);

    const planRow = (plan?.articles ?? []).find(({ slug }) => slug === row.slug);
    const plannedIds = planRow?.junctionIds ?? [];
    const orphans = junctionIds.filter((id) => !plannedIds.includes(id));
    const missing = plannedIds.filter((id) => !junctionIds.includes(id));

    if (orphans.length > 0) {
      violations.push({ code: "orphan-junction", slug: row.slug, ids: orphans });
    }
    if (missing.length > 0) {
      violations.push({ code: "missing-junction", slug: row.slug, ids: missing });
    }

    // Relation refs inside the document must point at existing junction rows.
    if (document) {
      const refIds = new Set(
        extractRelationRefs(document).map((ref) => String(ref.id)),
      );
      const dangling = [...refIds].filter((id) => !junctionIds.includes(id));
      if (dangling.length > 0) {
        violations.push({ code: "dangling-relation-ref", slug: row.slug, ids: dangling });
      }
    }

    articles.push({
      slug: row.slug,
      nodeTotal: document ? document.content.length : 0,
      junctionCount: junctionIds.length,
      planned: plannedSlugs.has(row.slug),
    });
  }

  for (const slug of ARTICLE_SLUGS) {
    if (!beforeState.some((row) => row.slug === slug)) {
      violations.push({ code: "missing-before-state", slug });
    }
  }

  return { ok: violations.length === 0, violations, articles };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const beforeStateFile = argumentValue("before-state");
  const planFile = argumentValue("plan");
  if (!beforeStateFile || !planFile) {
    throw new Error("Set --before-state=<ndjson> and --plan=<json>");
  }
  const beforeState = (await readFile(beforeStateFile, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  const plan = JSON.parse(await readFile(planFile, "utf8"));
  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await reconcileArticleContent(client, { beforeState, plan });
  for (const article of result.articles) {
    console.log(`- ${article.slug}: blocks ok, junctions ${article.junctionCount}`);
  }
  if (!result.ok) {
    console.error(`Reconciliation FAILED with ${result.violations.length} violation(s):`);
    for (const violation of result.violations) {
      console.error(`- [${violation.code}] ${violation.slug ?? ""}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Reconciliation OK.");
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
