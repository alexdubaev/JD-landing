// Task 9 (R5C): controlled cutover of the three baseline articles from HTML
// (articles.content) to deterministic ProseMirror JSON (articles.content_blocks).
//
// What this migration does:
// - converts the HTML of exactly the three production articles into the
//   canonical flexible-editor JSON (see the S1 pilot report);
// - writes ONLY articles.content_blocks (content, slug, status, SEO fields are
//   read-only — enforced by tests);
// - deletes stale articles_editor_nodes rows of a target article before the
//   patch, so no orphan junction rows survive;
// - supports --dry-run (default), --apply --release-id [--slug=<one>] and
//   --restore --slug=<one> --before-state=<file>.
//
// The converter is dependency-free by design: it tokenizes the HTML subset the
// articles actually use (headings, paragraphs, lists, tables, blockquote,
// strong/em/b/i, links, br) and degrades everything else to safe text.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

export const ARTICLE_SLUGS = [
  "kak-podgotovit-dannye-dlya-podbora-zapchasti-john-deere",
  "gde-iskat-artikul-i-markirovku-na-detali",
  "chto-proverit-pered-zakazom-komplektuyuschih",
];

const EDITOR_JUNCTION_COLLECTION = "articles_editor_nodes";
const EDITOR_JUNCTION_FIELD = "editor_nodes";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export const sha256Hex = (value) =>
  createHash("sha256").update(String(value), "utf8").digest("hex");

const marksKey = (marks) => JSON.stringify(marks);

// ---------------------------------------------------------------------------
// href safety
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\s\u0000-\u001f\u007f]/;

export function isSafeHref(href) {
  if (typeof href !== "string") return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (CONTROL_CHARS.test(trimmed)) {
    // Obfuscated scheme (embedded whitespace/control chars): judge by the
    // collapsed form; anything scheme-less with embedded control chars is
    // rejected outright.
    const collapsed = trimmed.replace(new RegExp(CONTROL_CHARS.source, "g"), "");
    const scheme = collapsed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (!scheme) return false;
    return ["http", "https"].includes(scheme[1].toLowerCase());
  }
  const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme) return ["http", "https"].includes(scheme[1].toLowerCase());
  return true; // relative (/x, #x, //host/x) — safe
}

// ---------------------------------------------------------------------------
// HTML tokenizer (subset)
// ---------------------------------------------------------------------------

const ENTITY_MAP = {
  nbsp: "\u00A0",
  laquo: "\u00AB",
  raquo: "\u00BB",
  mdash: "\u2014",
  ndash: "\u2013",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
};

export const decodeEntities = (value) =>
  String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => ENTITY_MAP[name] ?? match);

const ATTR_RE = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

const parseAttrs = (raw) => {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
};

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;

const stripDangerous = (html) =>
  String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<hr\b[^>]*>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");

function tokenize(html) {
  const tokens = [];
  const source = stripDangerous(html);
  TAG_RE.lastIndex = 0;
  let position = 0;
  let match;
  while ((match = TAG_RE.exec(source)) !== null) {
    if (match.index > position) {
      tokens.push({ kind: "text", raw: source.slice(position, match.index) });
    }
    tokens.push({
      kind: "tag",
      closing: match[1] === "/",
      name: match[2].toLowerCase(),
      attrs: parseAttrs(match[3] ?? ""),
    });
    position = TAG_RE.lastIndex;
  }
  if (position < source.length) {
    tokens.push({ kind: "text", raw: source.slice(position) });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Block/inline classification
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "blockquote",
  "figure", "figcaption", "div", "section", "article", "header", "footer",
  "main", "aside", "nav", "pre", "dl", "dt", "dd",
]);

// Transparent block containers: their children are parsed as blocks of the
// enclosing scope (figure → figcaption → text becomes a paragraph).
const TRANSPARENT_BLOCKS = new Set([
  "figure", "figcaption", "div", "section", "article", "header", "footer",
  "main", "aside", "nav", "dl", "dd", "pre",
]);

const MARK_TAGS = new Set(["strong", "b", "em", "i", "a", "code", "span", "u", "s", "small", "sub", "sup", "mark", "cite", "q", "abbr"]);

const openMarkFor = (name, attrs) => {
  if (name === "strong" || name === "b") return { type: "bold" };
  if (name === "em" || name === "i") return { type: "italic" };
  if (name === "code") return { type: "code" };
  if (name === "a") {
    const href = attrs?.href;
    if (!isSafeHref(href)) return null;
    return { type: "link", attrs: { href } };
  }
  return null; // transparent inline (span etc.)
};

// ---------------------------------------------------------------------------
// Inline event builder
// ---------------------------------------------------------------------------

const makeText = (text, marks) =>
  marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };

function eventsToNodes(events) {
  const out = [];
  const markStack = [];
  let buffer = null;

  const flushBuffer = () => {
    if (buffer) {
      out.push(buffer.node);
      buffer = null;
    }
  };

  for (const event of events) {
    if (event.kind === "text") {
      // Collapse regular whitespace runs but PRESERVE U+00A0 (decoded &nbsp;)
      // — the canonical articles keep non-breaking spaces verbatim.
      const text = decodeEntities(event.raw).replace(/[^\S\u00A0]+/g, " ");
      if (text === "") continue;
      const marks = markStack.filter(Boolean);
      const key = marksKey(marks);
      if (buffer && buffer.key === key) buffer.node.text += text;
      else {
        flushBuffer();
        buffer = { key, node: makeText(text, marks) };
      }
    } else if (event.kind === "open") {
      flushBuffer();
      markStack.push(openMarkFor(event.name, event.attrs));
    } else if (event.kind === "close") {
      flushBuffer();
      markStack.pop();
    } else if (event.kind === "hardBreak") {
      flushBuffer();
      out.push({ type: "hardBreak" });
    }
  }
  flushBuffer();
  return normalizeInline(out);
}

// Boundary trimming + re-merging of adjacent identical-mark runs. Middle
// whitespace-only runs (between two links) survive untouched.
function normalizeInline(nodes) {
  const trimmed = nodes.filter((node) => node.type !== "text" || node.text !== "");
  if (trimmed.length === 0) return [];
  const first = trimmed[0];
  if (first.type === "text") {
    first.text = first.text.replace(/^ +/, "");
    if (first.text === "") trimmed.shift();
  }
  if (trimmed.length === 0) return [];
  const last = trimmed[trimmed.length - 1];
  if (last.type === "text") {
    last.text = last.text.replace(/ +$/, "");
    if (last.text === "") trimmed.pop();
  }
  const merged = [];
  for (const node of trimmed) {
    const previous = merged[merged.length - 1];
    if (
      node.type === "text" &&
      previous?.type === "text" &&
      marksKey(previous.marks ?? []) === marksKey(node.marks ?? [])
    ) {
      previous.text += node.text;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

const paragraphOf = (events) => {
  const content = eventsToNodes(events);
  if (content.length === 0) return null;
  return { type: "paragraph", content };
};

// ---------------------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------------------

const isBlockBoundary = (token) =>
  token.kind === "tag" &&
  !token.closing &&
  (BLOCK_TAGS.has(token.name) || token.name === "br" ? BLOCK_TAGS.has(token.name) : false);

function parseScope(tokens, cursor, stopTags) {
  // Collect events (inline) until a stop tag, a block-level open tag or EOF.
  // Returns the events; cursor rests on the un-consumed token.
  const events = [];
  while (cursor.i < tokens.length) {
    const token = tokens[cursor.i];
    if (token.kind === "text") {
      events.push(token);
      cursor.i++;
      continue;
    }
    const { name, closing } = token;
    if (closing && stopTags.has(name)) return events;
    if (!closing && BLOCK_TAGS.has(name) && !TRANSPARENT_BLOCKS.has(name)) {
      return events; // block element interrupts the inline scope
    }
    if (name === "br" && !closing) {
      events.push({ kind: "hardBreak" });
      cursor.i++;
      continue;
    }
    if (MARK_TAGS.has(name)) {
      events.push({ kind: closing ? "close" : "open", name, attrs: token.attrs });
      cursor.i++;
      continue;
    }
    if (closing) {
      // Stray closing tag that is not our stop: ignore.
      cursor.i++;
      continue;
    }
    // Transparent block inside an inline scope (rare): close the scope.
    return events;
  }
  return events;
}

function parseBlocks(tokens, cursor, stopTags) {
  const blocks = [];
  let pending = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    const paragraph = paragraphOf(pending);
    if (paragraph) blocks.push(paragraph);
    pending = [];
  };

  while (cursor.i < tokens.length) {
    const token = tokens[cursor.i];
    if (token.kind === "text") {
      pending.push(token);
      cursor.i++;
      continue;
    }
    const { name, closing } = token;
    if (closing && stopTags.has(name)) {
      flushPending();
      return blocks; // caller consumes the closing tag
    }
    if (closing) {
      if (MARK_TAGS.has(name)) {
        pending.push({ kind: "close", name, attrs: token.attrs });
      }
      // stray block closers: ignore
      cursor.i++;
      continue;
    }
    if (name === "br") {
      pending.push({ kind: "hardBreak" });
      cursor.i++;
      continue;
    }
    if (MARK_TAGS.has(name)) {
      pending.push({ kind: "open", name, attrs: token.attrs });
      cursor.i++;
      continue;
    }
    if (BLOCK_TAGS.has(name)) {
      flushPending();
      cursor.i++;
      const node = parseBlockElement(name, token, tokens, cursor);
      if (node) blocks.push(...(Array.isArray(node) ? node : [node]));
      continue;
    }
    cursor.i++; // unknown tag: ignore
  }
  flushPending();
  return blocks;
}

function parseBlockElement(name, openToken, tokens, cursor) {
  switch (true) {
    case name === "p": {
      const events = parseScope(tokens, cursor, new Set(["p"]));
      if (tokens[cursor.i]?.kind === "tag" && tokens[cursor.i].closing) cursor.i++;
      return paragraphOf(events);
    }
    case /^h[1-6]$/.test(name): {
      const events = parseScope(tokens, cursor, new Set([name]));
      if (tokens[cursor.i]?.kind === "tag" && tokens[cursor.i].closing) cursor.i++;
      const content = eventsToNodes(events);
      if (content.length === 0) return null;
      const level = Number(name.slice(1));
      if (level >= 2 && level <= 4) {
        return { type: "heading", attrs: { level }, content };
      }
      return { type: "paragraph", content }; // h1/h5/h6 degrade to paragraphs
    }
    case name === "ul" || name === "ol": {
      const type = name === "ul" ? "bulletList" : "orderedList";
      const items = [];
      while (cursor.i < tokens.length) {
        const token = tokens[cursor.i];
        if (token.kind === "tag" && token.closing && token.name === name) {
          cursor.i++;
          break;
        }
        if (token.kind === "tag" && !token.closing && token.name === "li") {
          cursor.i++;
          items.push(parseListItem(tokens, cursor));
          continue;
        }
        cursor.i++; // thead-like noise inside lists
      }
      if (items.length === 0) return null;
      return { type, content: items };
    }
    case name === "table": {
      const rows = [];
      while (cursor.i < tokens.length) {
        const token = tokens[cursor.i];
        if (token.kind === "tag" && token.closing && token.name === "table") {
          cursor.i++;
          break;
        }
        if (token.kind === "tag" && !token.closing && token.name === "tr") {
          cursor.i++;
          rows.push(parseTableRow(tokens, cursor));
          continue;
        }
        cursor.i++; // thead/tbody/tfoot are transparent
      }
      if (rows.length === 0) return null;
      return { type: "table", content: rows };
    }
    case name === "blockquote": {
      const content = parseBlocks(tokens, cursor, new Set(["blockquote"]));
      if (tokens[cursor.i]?.kind === "tag" && tokens[cursor.i].closing) cursor.i++;
      if (content.length === 0) return null;
      return { type: "blockquote", content };
    }
    case TRANSPARENT_BLOCKS.has(name): {
      return parseBlocks(tokens, cursor, new Set([name])) ||
        (tokens[cursor.i]?.kind === "tag" && tokens[cursor.i].closing
          ? (cursor.i++, null)
          : null);
    }
    default:
      return null;
  }
}

function parseListItem(tokens, cursor) {
  const content = [];
  let pending = [];
  const flushPending = () => {
    const paragraph = paragraphOf(pending);
    if (paragraph) content.push(paragraph);
    pending = [];
  };
  while (cursor.i < tokens.length) {
    const token = tokens[cursor.i];
    if (token.kind === "tag" && token.closing && token.name === "li") {
      flushPending();
      cursor.i++;
      break;
    }
    if (token.kind === "text") {
      pending.push(token);
      cursor.i++;
      continue;
    }
    if (token.kind === "tag" && !token.closing && token.name === "br") {
      pending.push({ kind: "hardBreak" });
      cursor.i++;
      continue;
    }
    if (token.kind === "tag" && MARK_TAGS.has(token.name)) {
      pending.push({
        kind: token.closing ? "close" : "open",
        name: token.name,
        attrs: token.attrs,
      });
      cursor.i++;
      continue;
    }
    if (token.kind === "tag" && !token.closing && (token.name === "ul" || token.name === "ol")) {
      flushPending();
      cursor.i++;
      const node = parseBlockElement(token.name, token, tokens, cursor);
      if (node) content.push(node);
      continue;
    }
    if (token.kind === "tag" && token.closing && BLOCK_TAGS.has(token.name)) {
      // e.g. </ul> without </li>: close the item
      flushPending();
      break;
    }
    cursor.i++;
  }
  flushPending();
  if (content.length === 0) content.push({ type: "paragraph", content: [] });
  return { type: "listItem", content };
}

function parseTableRow(tokens, cursor) {
  const cells = [];
  while (cursor.i < tokens.length) {
    const token = tokens[cursor.i];
    if (token.kind === "tag" && token.closing && token.name === "tr") {
      cursor.i++;
      break;
    }
    if (token.kind === "tag" && !token.closing && (token.name === "th" || token.name === "td")) {
      const cellType = token.name === "th" ? "tableHeader" : "tableCell";
      cursor.i++;
      const events = parseScope(tokens, cursor, new Set([token.name]));
      if (tokens[cursor.i]?.kind === "tag" && tokens[cursor.i].closing) cursor.i++;
      cells.push({ type: cellType, content: [paragraphOf(events) ?? { type: "paragraph", content: [] }] });
      continue;
    }
    if (token.kind === "tag" && token.closing && token.name === "table") {
      break; // unterminated row: the table loop handles </table>
    }
    cursor.i++;
  }
  if (cells.length === 0) cells.push({ type: "tableCell", content: [{ type: "paragraph", content: [] }] });
  return { type: "tableRow", content: cells };
}

// ---------------------------------------------------------------------------
// Public converter
// ---------------------------------------------------------------------------

export function convertArticleHtml(html) {
  if (html == null) return { type: "doc", content: [] };
  const tokens = tokenize(html);
  const cursor = { i: 0 };
  const content = parseBlocks(tokens, cursor, new Set());
  return { type: "doc", content };
}

// ---------------------------------------------------------------------------
// Document validation and relation helpers
// ---------------------------------------------------------------------------

const ALLOWED_NODE_TYPES = new Set([
  "paragraph", "text", "heading", "bulletList", "orderedList", "listItem",
  "blockquote", "codeBlock", "horizontalRule", "table", "tableRow",
  "tableHeader", "tableCell", "hardBreak", "relationBlock", "relationInlineBlock",
]);

const ALLOWED_MARK_TYPES = new Set([
  "bold", "italic", "strike", "underline", "code", "subscript", "superscript",
  "link", "textAlign", "relationMark",
]);

export function validateContentDocument(document) {
  if (!document || typeof document !== "object" || document.type !== "doc") {
    return [{ code: "not-doc" }];
  }
  if (!Array.isArray(document.content)) return [{ code: "content-not-array" }];
  if (document.content.length === 0) return [{ code: "empty-content" }];

  const violations = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      violations.push({ code: "unknown-node-type", type: node.type });
    }
    if (node.type === "heading") {
      const level = node.attrs?.level;
      if (![2, 3, 4].includes(level)) {
        violations.push({ code: "invalid-heading-level", level: level ?? null });
      }
    }
    for (const mark of node.marks ?? []) {
      if (!ALLOWED_MARK_TYPES.has(mark.type)) {
        violations.push({ code: "unknown-mark-type", type: mark.type });
        continue;
      }
      if (mark.type === "link" && !isSafeHref(mark.attrs?.href)) {
        violations.push({ code: "unsafe-link-href", href: mark.attrs?.href ?? null });
      }
      if (mark.type === "relationMark" && mark.attrs?.junction !== EDITOR_JUNCTION_FIELD) {
        violations.push({ code: "invalid-relation-junction", junction: mark.attrs?.junction ?? null });
      }
    }
    if (
      (node.type === "relationBlock" || node.type === "relationInlineBlock") &&
      node.attrs?.junction !== EDITOR_JUNCTION_FIELD
    ) {
      violations.push({ code: "invalid-relation-junction", junction: node.attrs?.junction ?? null });
    }
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of document.content) visit(node);
  return violations;
}

export function extractRelationRefs(document) {
  const refs = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "relationBlock" || node.type === "relationInlineBlock") {
      refs.push({ ...(node.attrs ?? {}) });
    }
    for (const mark of node.marks ?? []) {
      if (mark.type === "relationMark") refs.push({ ...(mark.attrs ?? {}) });
    }
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of document?.content ?? []) visit(node);
  return refs;
}

export function countDocumentNodes(document) {
  const byType = {};
  let total = 0;
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    byType[node.type] = (byType[node.type] ?? 0) + 1;
    total += 1;
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of document?.content ?? []) visit(node);
  return { byType, total };
}

// ---------------------------------------------------------------------------
// Migration orchestration
// ---------------------------------------------------------------------------

export function evaluateArticles(articles, expectedSlugs = ARTICLE_SLUGS) {
  const blockers = [];
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  for (const slug of expectedSlugs) {
    if (!bySlug.has(slug)) blockers.push({ code: "missing-article", slug });
  }
  for (const article of articles) {
    if (!expectedSlugs.includes(article.slug)) {
      blockers.push({ code: "unexpected-article", slug: article.slug });
    }
    if (!(typeof article.content === "string") || article.content.trim() === "") {
      blockers.push({ code: "empty-content", slug: article.slug });
    }
  }
  if (articles.length !== expectedSlugs.length) {
    blockers.push({ code: "unexpected-article-count", count: articles.length });
  }
  return { ok: blockers.length === 0, blockers };
}

export function buildBeforeState(articles) {
  return [...articles]
    .sort((left, right) => left.slug.localeCompare(right.slug, "en"))
    .map((article) => ({
      slug: article.slug,
      id: article.id,
      content_sha256: sha256Hex(article.content ?? ""),
      content_blocks: null,
    }));
}

const stoppedResult = (blockers, summary) => ({
  ok: false,
  stopped: true,
  applied: false,
  noop: false,
  migration: "article-content",
  blockers,
  articles: [],
  beforeState: [],
  summary,
});

export async function runArticleContentMigration(
  client,
  { apply = false, releaseId = null, slug = null } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }
  if (slug !== null && !ARTICLE_SLUGS.includes(slug)) {
    return stoppedResult(
      [{ code: "unknown-slug", slug }],
      { targetSlugs: ARTICLE_SLUGS },
    );
  }

  const targetSlugs = slug === null ? [...ARTICLE_SLUGS] : [slug];
  const slugFilter = new URLSearchParams({
    "filter[slug][_in]": targetSlugs.join(","),
    fields: "id,slug,title,status,content,content_blocks",
    limit: String(targetSlugs.length),
    sort: "slug",
  });
  const articles = await client.request(`/items/articles?${slugFilter.toString()}`);
  // Process in the canonical ARTICLE_SLUGS order (the per-article cutover
  // sequence), not alphabetically.
  const rank = new Map(targetSlugs.map((target, index) => [target, index]));
  const sorted = [...articles].sort(
    (left, right) =>
      (rank.get(left.slug) ?? targetSlugs.length) -
      (rank.get(right.slug) ?? targetSlugs.length),
  );

  const evaluation = evaluateArticles(sorted, targetSlugs);
  if (!evaluation.ok) {
    return stoppedResult(evaluation.blockers, { targetSlugs });
  }

  // Convert every target article; STOP if any converts to an empty document.
  const plans = [];
  const conversionBlockers = [];
  for (const article of sorted) {
    const contentBlocks = convertArticleHtml(article.content);
    if (contentBlocks.content.length === 0) {
      conversionBlockers.push({ code: "empty-document", slug: article.slug });
      continue;
    }
    const violations = validateContentDocument(contentBlocks);
    if (violations.length > 0) {
      conversionBlockers.push({ code: "invalid-document", slug: article.slug, violations });
      continue;
    }
    plans.push({
      slug: article.slug,
      id: article.id,
      content_blocks: contentBlocks,
      junctionIds: [], // rich-text cutover creates no relation nodes
      nodeCounts: countDocumentNodes(contentBlocks),
      staleJunctionIds: [],
    });
  }
  if (conversionBlockers.length > 0) {
    return stoppedResult(conversionBlockers, { targetSlugs });
  }

  // Orphan report: existing junction rows per target article.
  const junctionFilter = new URLSearchParams({
    "filter[articles_id][_in]": sorted.map(({ id }) => id).join(","),
    fields: "id,articles_id,collection,item",
    limit: "-1",
  });
  const junctions = await client.request(
    `/items/${EDITOR_JUNCTION_COLLECTION}?${junctionFilter.toString()}`,
  );
  const junctionsBySlug = new Map(sorted.map(({ id, slug: s }) => [id, s]));
  for (const row of junctions) {
    const plan = plans.find((candidate) => candidate.slug === junctionsBySlug.get(row.articles_id));
    if (plan) plan.staleJunctionIds.push(row.id);
  }

  const beforeState = buildBeforeState(sorted);

  if (apply) {
    for (const plan of plans) {
      // Stale own junction rows are removed BEFORE the content patch, so a
      // failed patch cannot leave orphans behind.
      for (const junctionId of plan.staleJunctionIds) {
        await client.request(
          `/items/${EDITOR_JUNCTION_COLLECTION}/${encodeURIComponent(junctionId)}`,
          { method: "DELETE" },
        );
      }
      await client.request(`/items/articles/${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ content_blocks: plan.content_blocks }),
      });
      plan.patched = true;
    }
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop: false,
    migration: "article-content",
    releaseId,
    blockers: [],
    articles: plans,
    beforeState,
    summary: {
      targetSlugs,
      nodeCounts: Object.fromEntries(plans.map((plan) => [plan.slug, plan.nodeCounts.total])),
    },
  };
}

export function collectJunctionIdsBySlug(planArtifact) {
  const map = {};
  for (const plan of planArtifact?.articles ?? []) {
    map[plan.slug] = (plan.junctionIds ?? []).filter((id) => typeof id === "string");
  }
  return map;
}

export async function runRestore(
  client,
  beforeState,
  { apply = false, slug = null, junctionIdsByArticle = {} } = {},
) {
  if (!slug) throw new Error("restore requires --slug=<slug>");
  const rows = beforeState.filter((row) => row.slug === slug);
  if (rows.length !== 1) {
    throw new Error(`restore requires exactly one before-state row for ${slug}`);
  }
  const row = rows[0];
  if (!apply) {
    return { applied: false, slug, junctionIds: junctionIdsByArticle[slug] ?? [] };
  }
  await client.request(`/items/articles/${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ content_blocks: null }),
  });
  for (const junctionId of junctionIdsByArticle[slug] ?? []) {
    await client.request(
      `/items/${EDITOR_JUNCTION_COLLECTION}/${encodeURIComponent(junctionId)}`,
      { method: "DELETE" },
    );
  }
  return { applied: true, slug, junctionIds: junctionIdsByArticle[slug] ?? [] };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const restore = args.includes("--restore");
  const slug = argumentValue("slug", args) ?? null;
  const releaseId = argumentValue("release-id", args) ?? null;
  const outputDirectory = argumentValue("output", args) ?? null;
  const beforeStateFile = argumentValue("before-state", args) ?? null;
  const client = await DirectusAdminClient.connectFromEnvironment();

  if (restore) {
    const beforeState = beforeStateFile
      ? (await readFile(beforeStateFile, "utf8"))
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line))
      : [];
    let junctionIdsByArticle = {};
    const planFile = argumentValue("plan", args);
    if (planFile) {
      junctionIdsByArticle = collectJunctionIdsBySlug(JSON.parse(await readFile(planFile, "utf8")));
    }
    const result = await runRestore(client, beforeState, {
      apply,
      slug,
      junctionIdsByArticle,
    });
    console.log(
      `${apply ? "Restored" : "Planned restore of"} ${result.slug} (junction ids: ${result.junctionIds.length})`,
    );
    return;
  }

  const result = await runArticleContentMigration(client, { apply, releaseId, slug });
  if (!result.ok) {
    console.error(`STOP: ${result.blockers.length} blocker(s):`);
    for (const blocker of result.blockers) console.error(`- [${blocker.code}] ${blocker.slug ?? ""}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `${apply ? "Applied" : "Planned"} article content cutover for ${result.articles.length} article(s)` +
      `${slug ? ` (slug: ${slug})` : ""}:`,
  );
  for (const plan of result.articles) {
    console.log(
      `- ${plan.slug}: ${plan.nodeCounts.total} nodes, stale junctions ${plan.staleJunctionIds.length}`,
    );
  }
  if (outputDirectory) {
    const artifact = {
      releaseId,
      appliedAt: new Date().toISOString(),
      articles: result.articles.map(
        ({ slug: s, id, junctionIds, staleJunctionIds, nodeCounts }) => ({
          slug: s,
          id,
          junctionIds,
          staleJunctionIds,
          nodeCounts,
        }),
      ),
    };
    const planPath = path.join(outputDirectory, "article-content-plan.json");
    await writeFile(planPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    const beforePath = path.join(outputDirectory, "article-content-before-state.ndjson");
    await writeFile(
      beforePath,
      result.beforeState.map((row) => JSON.stringify(row)).join("\n") + "\n",
      "utf8",
    );
    console.log(`Wrote plan + before-state to ${outputDirectory}`);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
