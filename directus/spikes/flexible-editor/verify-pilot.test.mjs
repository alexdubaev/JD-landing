import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  validateProseMirrorDoc,
  relationRefs,
  richTextOnlyHasNoRelations,
  relationRefsAreValid,
  securityScan,
  loadFixtures,
} from "./verify-pilot.mjs";

const fixturesPath = fileURLToPath(new URL("./article-fixtures.json", import.meta.url));
const fixtures = await loadFixtures(fixturesPath);

test("richTextOnly: valid ProseMirror, no relation nodes, safe", () => {
  const doc = fixtures.richTextOnly;
  assert.equal(validateProseMirrorDoc(doc).ok, true, validateProseMirrorDoc(doc).errors.join("; "));
  assert.equal(richTextOnlyHasNoRelations(doc), true);
  assert.equal(relationRefs(doc).length, 0);
  const sec = securityScan(doc);
  assert.equal(sec.safe, true, sec.violations.join("; "));
});

test("mixedContract: valid, carries product + category relation refs only", () => {
  const doc = fixtures.mixedContract;
  const v = validateProseMirrorDoc(doc);
  assert.equal(v.ok, true, v.errors.join("; "));
  const refs = relationRefs(doc);
  const collections = refs.map((r) => r.collection).sort();
  assert.deepEqual(collections, ["categories", "categories", "products"]);
  const ok = relationRefsAreValid(doc);
  assert.equal(ok.ok, true, ok.violations.join("; "));
  const sec = securityScan(doc);
  assert.equal(sec.safe, true, sec.violations.join("; "));
});

test("mixedContract: relation nodes store {id,junction,collection}, no entity snapshot", () => {
  for (const ref of relationRefs(fixtures.mixedContract)) {
    assert.ok(ref.id, "relation node must carry an id");
    assert.equal(ref.junction, "editor_nodes");
    assert.ok(ref.collection, "relation node must carry a collection");
    for (const key of Object.keys(ref)) {
      if (!["id", "junction", "collection", "nodeType"].includes(key)) {
        assert.fail(`relation node leaked snapshot attr: ${key}`);
      }
    }
  }
});

test("security corpus: scripts, unsafe URLs and event handlers are rejected", () => {
  for (const { name, doc } of fixtures.securityCorpus) {
    const sec = securityScan(doc);
    assert.equal(sec.safe, false, `expected rejection for: ${name}`);
    assert.ok(sec.violations.length > 0, `expected violations for: ${name}`);
  }
});

test("unknown / non-doc root is rejected", () => {
  assert.equal(validateProseMirrorDoc({ type: "paragraph" }).ok, false);
  assert.equal(validateProseMirrorDoc({ type: "doc", content: "nope" }).ok, false);
});
