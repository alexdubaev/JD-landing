// Flexible Editor 1.9.0 pilot verifier (API-automatable contract checks).
// Validates the ProseMirror JSON contract the extension produces, independent
// of a live editor session. UI-only behaviour (M2A sync, drag/drop, copy/paste)
// is documented in the pilot report as manual QA before production cutover.
//
// These checks encode what the FRONTEND renderer (Task 8, F1) must rely on:
// a strict node/mark allowlist, relation nodes that hold only references
// {id, junction, collection}, and rejection of raw-HTML execution surfaces.

import { readFile } from "node:fs/promises";

export const ALLOWED_NODE_TYPES = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList",
  "listItem", "blockquote", "codeBlock", "horizontalRule", "table",
  "tableRow", "tableHeader", "tableCell", "hardBreak",
  "relationBlock", "relationInlineBlock",
]);

export const ALLOWED_MARK_TYPES = new Set([
  "bold", "italic", "strike", "underline", "code", "subscript",
  "superscript", "link", "textAlign", "relationMark",
]);

export const RELATION_NODE_TYPES = new Set(["relationBlock", "relationInlineBlock", "relationMark"]);
const RELATION_ATTRS = ["id", "junction", "collection"];
const UNSAFE_URL = /^(javascript|data|vbscript|file):/i;

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Collect every relation reference found in the doc.
export function relationRefs(doc) {
  const refs = [];
  const walk = (node) => {
    if (!isObj(node)) return;
    if (typeof node.type === "string" && RELATION_NODE_TYPES.has(node.type)) {
      refs.push({ nodeType: node.type, ...(node.attrs ?? {}) });
    }
    for (const mark of node.marks ?? []) {
      if (isObj(mark) && typeof mark.type === "string" && RELATION_NODE_TYPES.has(mark.type)) {
        refs.push({ nodeType: mark.type, ...(mark.attrs ?? {}) });
      }
    }
    for (const c of node.content ?? []) walk(c);
  };
  walk(doc);
  return refs;
}

// A rich-text-only document must contain NO relation nodes.
export function richTextOnlyHasNoRelations(doc) {
  return relationRefs(doc).length === 0;
}

function checkNode(node, errors) {
  if (!isObj(node)) { errors.push("non-object node"); return; }
  if (typeof node.type !== "string") { errors.push("node without type"); return; }
  if (!ALLOWED_NODE_TYPES.has(node.type)) errors.push(`disallowed node type: ${node.type}`);

  if (isObj(node.attrs)) {
    for (const key of Object.keys(node.attrs)) {
      if (/^on/i.test(key)) errors.push(`event-handler attr on ${node.type}: ${key}`);
    }
  }
  for (const mark of node.marks ?? []) {
    if (!isObj(mark) || typeof mark.type !== "string") { errors.push("bad mark"); continue; }
    if (!ALLOWED_MARK_TYPES.has(mark.type)) errors.push(`disallowed mark type: ${mark.type}`);
    const href = mark.attrs?.href;
    if (typeof href === "string" && UNSAFE_URL.test(href)) errors.push(`unsafe href: ${href}`);
  }
  for (const c of node.content ?? []) checkNode(c, errors);
}

// Structural + allowlist validation of a ProseMirror document.
export function validateProseMirrorDoc(doc) {
  const errors = [];
  if (!isObj(doc) || doc.type !== "doc") errors.push("root is not a doc node");
  if (!Array.isArray(doc?.content)) errors.push("doc.content is not an array");
  else checkNode(doc, errors);
  return { ok: errors.length === 0, errors };
}

// Security scan: returns violations (disallowed nodes, event handlers, unsafe URLs).
export function securityScan(doc) {
  const errors = [];
  checkNode(doc, errors);
  return { safe: errors.length === 0, violations: errors };
}

// Validate that every relation node carries the reference contract
// {id, junction, collection} and nothing resembling entity snapshot data.
export function relationRefsAreValid(doc) {
  const bad = [];
  for (const ref of relationRefs(doc)) {
    for (const key of RELATION_ATTRS) {
      if (!ref[key]) bad.push(`${ref.nodeType} missing attr ${key}`);
    }
    for (const key of Object.keys(ref)) {
      if (!RELATION_ATTRS.includes(key) && key !== "nodeType") {
        bad.push(`${ref.nodeType} carries extra attr ${key} (snapshot data leak risk)`);
      }
    }
  }
  return { ok: bad.length === 0, violations: bad };
}

export async function loadFixtures(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
