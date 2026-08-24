import { computeBeforeHash, computeDedupeKey } from "./work-items.mjs";

const published = (row) => row && row.status === "published";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderDraftHtml({ title, sections = [] }) {
  return sections
    .map((section) => `<h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p>`)
    .join("\n")
    .replace(/^/, `<h1>${escapeHtml(title)}</h1>\n`);
}

function recommendation({ entityType, entity, subtype, label }) {
  const current = {
    seo_title: entity.seo_title ?? "",
    seo_description: entity.seo_description ?? "",
  };
  const entityKey = entity.slug || entity.id;
  const base = {
    type: "catalog",
    subtype,
    status: "ready",
    severity: "minor",
    priority_score: 10,
    confidence: 1,
    entity_type: entityType,
    entity_id: entity.id ?? null,
    entity_key: entityKey,
    url: entity.slug ? `/${entityType === "pages" ? "" : "catalog/"}${entity.slug}` : null,
    title: `${label}: ${entity.title ?? entity.slug ?? entity.id}`,
    summary: "Published content is missing editable SEO metadata.",
    recommendation: "Prepare an editorial recommendation for human review; no catalog field is changed.",
    current_value_json: current,
    proposed_value_json: { title: entity.title ?? "", seo_title: entity.seo_title ?? "", seo_description: entity.seo_description ?? "" },
    evidence_json: [{ source: "directus", collection: entityType, id: entity.id ?? null }],
    sources_json: [{ type: "directus", collection: entityType, id: entity.id ?? null }],
    metrics_json: { published: true },
    before_hash: computeBeforeHash(current),
  };
  return { ...base, dedupe_key: computeDedupeKey({
    entity_type: base.entity_type,
    entity_key: base.entity_key,
    type: base.type,
    subtype: base.subtype,
    patch: { seo_title: current.seo_title, seo_description: current.seo_description },
  }) };
}

export function buildShadowWorkItems({ products = [], categories = [], pages = [] } = {}) {
  const items = [];
  for (const product of products.filter(published)) {
    if (!String(product.seo_title ?? "").trim() || !String(product.seo_description ?? "").trim()) {
      items.push(recommendation({ entityType: "products", entity: product, subtype: "missing_metadata", label: "Product" }));
    }
  }
  for (const category of categories.filter(published)) {
    if (!String(category.seo_title ?? "").trim() || !String(category.seo_description ?? "").trim()) {
      items.push(recommendation({ entityType: "categories", entity: category, subtype: "missing_metadata", label: "Category" }));
    }
  }
  for (const page of pages.filter(published)) {
    if (!String(page.seo_title ?? "").trim() || !String(page.seo_description ?? "").trim()) {
      items.push(recommendation({ entityType: "pages", entity: page, subtype: "missing_metadata", label: "Page" }));
    }
  }
  return items.sort((a, b) => a.dedupe_key.localeCompare(b.dedupe_key));
}
