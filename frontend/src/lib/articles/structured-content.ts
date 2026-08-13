/**
 * Structured article content parser and validator.
 *
 * This module owns the LOCAL contract for the JSON stored in
 * `articles.content_blocks` (Directus Flexible Editor). It is intentionally
 * self-contained: node types live here and are NOT shared through
 * `src/types/*`, so the structured renderer can be wired in independently of
 * the shared catalog/content type surfaces (which are owned by another track).
 *
 * Contract (see docs/superpowers/specs/2026-08-13-directus-admin-reversible-
 * architecture-design.md, "Article body"):
 *
 *   rich text -> product relation -> rich text -> CTA relation
 *             -> category relation -> table -> rich text
 *
 * Rules enforced here:
 *  - Explicit node-type allowlist. Unknown / corrupted nodes are normalised
 *    to a non-executable {@link UnknownNode} placeholder; they never carry raw
 *    HTML into the output.
 *  - Relation nodes (product / category / CTA) hold ONLY a reference (`id`).
 *    Title, price, slug and URL are never embedded in the JSON. The renderer
 *    resolves live data through an injectable {@link RelationResolver}.
 *  - H1 is disabled; only heading levels 2-4 are accepted.
 *  - URLs are validated by {@link isSafeUrl}: `javascript:`, `data:`,
 *    `vbscript:`, `file:` and obfuscated variants are rejected. Unsafe link
 *    marks are dropped while their text content is preserved.
 *
 * The module is dependency-free and side-effect free. It performs no Directus
 * I/O; the wiring layer supplies relation data at render time.
 */

// ---------------------------------------------------------------------------
// Inline nodes
// ---------------------------------------------------------------------------

export type HeadingLevel = 2 | 3 | 4;

export type MarkType = "bold" | "italic" | "link";

export interface LinkMark {
  type: "link";
  attrs: { href: string };
}

export interface BoldMark {
  type: "bold";
}

export interface ItalicMark {
  type: "italic";
}

export type TextMark = BoldMark | ItalicMark | LinkMark;

export interface TextNode {
  type: "text";
  text: string;
  marks?: TextMark[];
}

export interface HardBreakNode {
  type: "hardBreak";
}

export type InlineNode = TextNode | HardBreakNode;

// ---------------------------------------------------------------------------
// Block nodes (the renderer allowlist)
// ---------------------------------------------------------------------------

export interface ParagraphNode {
  type: "paragraph";
  content?: InlineNode[];
}

export interface HeadingNode {
  type: "heading";
  attrs: { level: HeadingLevel };
  content?: InlineNode[];
}

export interface ListItemNode {
  type: "listItem";
  content: BlockNode[];
}

export interface BulletListNode {
  type: "bulletList";
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: "orderedList";
  content: ListItemNode[];
}

export interface BlockquoteNode {
  type: "blockquote";
  content: BlockNode[];
}

export interface TableHeaderNode {
  type: "tableHeader";
  content: BlockNode[];
}

export interface TableCellNode {
  type: "tableCell";
  content: BlockNode[];
}

export interface TableRowNode {
  type: "tableRow";
  content: Array<TableCellNode | TableHeaderNode>;
}

export interface TableNode {
  type: "table";
  content: TableRowNode[];
}

export interface ProductRelationNode {
  type: "productRelation";
  attrs: { id: string };
}

export interface CategoryRelationNode {
  type: "categoryRelation";
  attrs: { id: string };
}

export type CtaVariant = "primary" | "secondary" | "text";

export interface CtaRelationNode {
  type: "ctaRelation";
  attrs: { id: string; label?: string; variant?: CtaVariant };
}

/**
 * Placeholder for any node whose type is not on the allowlist, or whose
 * structure is corrupted. It is non-executable: it carries no content and no
 * attributes. The renderer renders a diagnostic in preview mode and nothing
 * in public mode.
 */
export interface UnknownNode {
  type: "unknown";
  originalType: string | null;
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | TableNode
  | ProductRelationNode
  | CategoryRelationNode
  | CtaRelationNode
  | UnknownNode;

export interface ContentDocument {
  type: "doc";
  content: BlockNode[];
}

// ---------------------------------------------------------------------------
// Relation resolution contract (data supplied by the wiring layer)
// ---------------------------------------------------------------------------

export type RelationKind = "product" | "category" | "cta";

export interface RelationRef {
  kind: RelationKind;
  id: string;
}

export interface ResolvedProduct {
  kind: "product";
  title: string;
  url: string;
  priceLabel?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface ResolvedCategory {
  kind: "category";
  title: string;
  url: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface ResolvedCta {
  kind: "cta";
  label: string;
  url: string;
  variant?: CtaVariant;
}

export type ResolvedRelation = ResolvedProduct | ResolvedCategory | ResolvedCta;

/**
 * Context handed to the resolver alongside a relation reference. For CTA nodes
 * the editor may store presentation data (label/variant) that is independent of
 * the target entity; the resolver decides how to merge it with target data.
 */
export interface RelationResolverContext {
  nodeLabel?: string;
  nodeVariant?: CtaVariant;
}

/**
 * Resolves a relation reference to renderable data. The resolver is supplied
 * by the wiring layer (Agent RC), which pre-fetches the referenced entities
 * with bounded Directus `fields`/`deep`/`limit` and exposes a synchronous
 * lookup. Returning `undefined` means the relation could not be resolved; the
 * renderer then shows a safe placeholder in preview and nothing in public.
 */
export type RelationResolver = (
  ref: RelationRef,
  context?: RelationResolverContext,
) => ResolvedRelation | undefined;

// ---------------------------------------------------------------------------
// Parse result
// ---------------------------------------------------------------------------

export type ParseError =
  | "absent"
  | "not-object"
  | "not-doc"
  | "content-not-array"
  | "empty-content";

export type ParseResult =
  | { ok: true; document: ContentDocument }
  | { ok: false; reason: ParseError };

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  "http",
  "https",
  "mailto",
  "tel",
]);

/**
 * Returns true when `value` is a string that is safe to use as an `href`.
 *
 * Browsers strip leading whitespace and ignore embedded tab/CR/LF/control
 * characters when resolving URLs, so a payload such as `java\nscript:alert(1)`
 * is interpreted as `javascript:alert(1)`. We therefore strip every C0 control
 * plus space (U+0000-U+0020) before deciding, then only accept URLs that are
 * either scheme-less (relative path, anchor, protocol-relative) or use one of
 * the explicitly allowed schemes.
 */
export function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const stripped = value.replace(/[\u0000-\u0020]/g, "");
  if (stripped.length === 0) {
    return false;
  }
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped);
  if (match === null) {
    // No scheme: relative path, anchor or protocol-relative URL. These cannot
    // carry `javascript:` / `data:` semantics.
    return true;
  }
  return ALLOWED_SCHEMES.has(match[1].toLowerCase());
}

// ---------------------------------------------------------------------------
// Internal normalisers
// ---------------------------------------------------------------------------

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownNode(originalType: unknown): UnknownNode {
  return {
    type: "unknown",
    originalType: typeof originalType === "string" ? originalType : null,
  };
}

function normalizeMarks(input: unknown): TextMark[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const out: TextMark[] = [];
  for (const mark of input) {
    if (!isPlainObject(mark) || typeof mark.type !== "string") {
      continue;
    }
    if (mark.type === "bold") {
      out.push({ type: "bold" });
    } else if (mark.type === "italic") {
      out.push({ type: "italic" });
    } else if (mark.type === "link") {
      const attrs = isPlainObject(mark.attrs) ? mark.attrs : {};
      const href = typeof attrs.href === "string" ? attrs.href : undefined;
      if (href !== undefined && isSafeUrl(href)) {
        out.push({ type: "link", attrs: { href } });
      }
      // Unsafe or missing href: drop the mark, keep the text plain.
    }
    // Unknown mark (including any event-handler-style name): dropped.
  }
  return out.length > 0 ? out : undefined;
}

function normalizeInline(input: unknown): InlineNode | null {
  if (!isPlainObject(input) || typeof input.type !== "string") {
    return null;
  }
  if (input.type === "text") {
    if (typeof input.text !== "string") {
      return null;
    }
    const node: TextNode = { type: "text", text: input.text };
    const marks = normalizeMarks(input.marks);
    if (marks) {
      node.marks = marks;
    }
    return node;
  }
  if (input.type === "hardBreak") {
    return { type: "hardBreak" };
  }
  // Unknown inline node: drop entirely (no execution surface).
  return null;
}

function normalizeInlineList(input: unknown): InlineNode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: InlineNode[] = [];
  for (const item of input) {
    const node = normalizeInline(item);
    if (node !== null) {
      out.push(node);
    }
  }
  return out;
}

function normalizeBlockList(input: unknown): BlockNode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map((item) => normalizeBlock(item));
}

function normalizeListItems(input: unknown): ListItemNode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: ListItemNode[] = [];
  for (const item of input) {
    if (!isPlainObject(item) || item.type !== "listItem") {
      continue;
    }
    out.push({ type: "listItem", content: normalizeBlockList(item.content) });
  }
  return out;
}

function normalizeTableRows(input: unknown): TableRowNode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: TableRowNode[] = [];
  for (const row of input) {
    if (!isPlainObject(row) || row.type !== "tableRow") {
      continue;
    }
    const cells: Array<TableCellNode | TableHeaderNode> = [];
    const rawCells = Array.isArray(row.content) ? row.content : [];
    for (const cell of rawCells) {
      if (!isPlainObject(cell)) {
        continue;
      }
      if (cell.type === "tableCell") {
        cells.push({ type: "tableCell", content: normalizeBlockList(cell.content) });
      } else if (cell.type === "tableHeader") {
        cells.push({ type: "tableHeader", content: normalizeBlockList(cell.content) });
      }
    }
    out.push({ type: "tableRow", content: cells });
  }
  return out;
}

function normalizeRelationNode(
  type: "productRelation" | "categoryRelation" | "ctaRelation",
  attrs: unknown,
): BlockNode {
  const a = isPlainObject(attrs) ? attrs : {};
  const rawId = a.id;
  const id =
    typeof rawId === "string" && rawId.trim().length > 0 ? rawId : null;
  if (id === null) {
    return unknownNode(type);
  }
  if (type === "productRelation") {
    return { type: "productRelation", attrs: { id } };
  }
  if (type === "categoryRelation") {
    return { type: "categoryRelation", attrs: { id } };
  }
  // ctaRelation: presentation data (label/variant) is permitted because it is
  // independent of the target entity's URL/title. Target data stays external.
  const node: CtaRelationNode = { type: "ctaRelation", attrs: { id } };
  if (typeof a.label === "string" && a.label.length > 0) {
    node.attrs.label = a.label;
  }
  if (
    a.variant === "primary" ||
    a.variant === "secondary" ||
    a.variant === "text"
  ) {
    node.attrs.variant = a.variant;
  }
  return node;
}

function normalizeBlock(input: unknown): BlockNode {
  if (!isPlainObject(input) || typeof input.type !== "string") {
    return unknownNode(null);
  }
  switch (input.type) {
    case "paragraph":
      return {
        type: "paragraph",
        content: normalizeInlineList(input.content),
      };
    case "heading": {
      const attrs = isPlainObject(input.attrs) ? input.attrs : {};
      const level = attrs.level;
      if (level === 2 || level === 3 || level === 4) {
        return {
          type: "heading",
          attrs: { level },
          content: normalizeInlineList(input.content),
        };
      }
      // Level 1 (H1) or any other level is disabled -> unknown.
      return unknownNode("heading");
    }
    case "bulletList":
      return { type: "bulletList", content: normalizeListItems(input.content) };
    case "orderedList":
      return { type: "orderedList", content: normalizeListItems(input.content) };
    case "blockquote":
      return { type: "blockquote", content: normalizeBlockList(input.content) };
    case "table":
      return { type: "table", content: normalizeTableRows(input.content) };
    case "productRelation":
    case "categoryRelation":
    case "ctaRelation":
      return normalizeRelationNode(input.type, input.attrs);
    default:
      // Anything else (script, image, iframe, custom blocks, ...) is off the
      // allowlist and becomes a non-executable placeholder.
      return unknownNode(input.type);
  }
}

// ---------------------------------------------------------------------------
// Public parse API
// ---------------------------------------------------------------------------

/**
 * Validates and normalises raw `content_blocks` JSON.
 *
 * Returns `{ ok: false }` (signalling the caller should use the sanitized HTML
 * fallback) only for input that cannot be treated as a document at all: null,
 * primitives, arrays, objects without `type: "doc"`, non-array `content`, or an
 * empty content array. A non-empty document is always accepted; individual
 * unknown or corrupted nodes are normalised to {@link UnknownNode} in place and
 * never cause a fallback, so a single bad node does not break rendering of the
 * rest of the article.
 */
export function parseStructuredContent(input: unknown): ParseResult {
  if (input === null || input === undefined) {
    return { ok: false, reason: "absent" };
  }
  if (!isPlainObject(input)) {
    return { ok: false, reason: "not-object" };
  }
  if (input.type !== "doc") {
    return { ok: false, reason: "not-doc" };
  }
  if (!Array.isArray(input.content)) {
    return { ok: false, reason: "content-not-array" };
  }
  if (input.content.length === 0) {
    return { ok: false, reason: "empty-content" };
  }
  return {
    ok: true,
    document: { type: "doc", content: normalizeBlockList(input.content) },
  };
}

/**
 * Collects every relation reference reachable in the document, de-duplicated by
 * `(kind, id)` and preserving first-occurrence order. The wiring layer uses
 * this to batch-fetch the referenced products/categories/CTAs with a single
 * bounded Directus query before rendering.
 */
export function extractRelationRefs(doc: ContentDocument): RelationRef[] {
  const refs: RelationRef[] = [];
  const seen = new Set<string>();

  const add = (kind: RelationKind, id: string): void => {
    const key = `${kind}:${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ kind, id });
    }
  };

  const walkBlocks = (blocks: readonly BlockNode[]): void => {
    for (const block of blocks) {
      switch (block.type) {
        case "productRelation":
          add("product", block.attrs.id);
          break;
        case "categoryRelation":
          add("category", block.attrs.id);
          break;
        case "ctaRelation":
          add("cta", block.attrs.id);
          break;
        case "bulletList":
        case "orderedList":
          for (const item of block.content) {
            walkBlocks(item.content);
          }
          break;
        case "blockquote":
          walkBlocks(block.content);
          break;
        case "table":
          for (const row of block.content) {
            for (const cell of row.content) {
              walkBlocks(cell.content);
            }
          }
          break;
        case "paragraph":
        case "heading":
        case "unknown":
          // No nested blocks or relations.
          break;
      }
    }
  };

  walkBlocks(doc.content);
  return refs;
}
