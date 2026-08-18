import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCode,
  normalizeRow,
  parsePrice,
  parseTimestamp,
} from "./normalize.mjs";

test("normalizeCode matches the sku_normalized derivation contract", () => {
  assert.equal(normalizeCode(" re-504 836 "), "RE504836");
  assert.equal(normalizeCode("syn.0001"), "SYN0001");
  assert.equal(normalizeCode("---"), "");
  assert.equal(normalizeCode(null), "");
});

test("parsePrice accepts numbers and ru/en numeric strings, rejects junk", () => {
  assert.deepEqual(parsePrice(1234.5), { ok: true, value: 1234.5 });
  assert.deepEqual(parsePrice("100"), { ok: true, value: 100 });
  assert.deepEqual(parsePrice("1 234,56"), { ok: true, value: 1234.56 });
  assert.deepEqual(parsePrice("1234.56"), { ok: true, value: 1234.56 });
  // Two different separators are ambiguous — refuse instead of guessing.
  assert.equal(parsePrice("1,234.56").ok, false);
  assert.deepEqual(parsePrice(""), { ok: true, value: null });
  assert.deepEqual(parsePrice(null), { ok: true, value: null });
  assert.equal(parsePrice("abc").ok, false);
  assert.equal(parsePrice(-5).ok, false);
  assert.equal(parsePrice(Number.POSITIVE_INFINITY).ok, false);
  assert.equal(parsePrice({}).ok, false);
});

test("parseTimestamp normalizes ISO dates, ru dates and datetimes to UTC ISO", () => {
  assert.deepEqual(parseTimestamp("2026-08-17"), {
    ok: true,
    value: "2026-08-17T00:00:00.000Z",
  });
  assert.deepEqual(parseTimestamp("17.08.2026"), {
    ok: true,
    value: "2026-08-17T00:00:00.000Z",
  });
  assert.equal(
    Date.parse(parseTimestamp("2026-08-17T10:30:00Z").value),
    Date.parse("2026-08-17T10:30:00Z"),
  );
  assert.deepEqual(parseTimestamp(""), { ok: true, value: null });
  assert.equal(parseTimestamp("not-a-date").ok, false);
  assert.equal(parseTimestamp(42).ok, false);
});

test("normalizeRow trims sku, derives the match key and keeps unknown keys", () => {
  const { ok, row, skuKey } = normalizeRow({
    " sku-x1 ": 100,
    sku: " Syn-0001 ",
    price: "1 000,50",
    title: "  ",
    verified_at: "2026-08-17",
  });
  assert.equal(ok, false, "unknown key sku-x1 is an error, not a drop");
  assert.equal(row.sku, "Syn-0001");
  assert.equal(skuKey, "SYN0001");
  assert.equal(row.price, 1000.5);
  assert.equal(row.title, null);
  assert.equal(row.verified_at, "2026-08-17T00:00:00.000Z");
  assert.equal("sku-x1" in row, true, "unknown keys survive for the planner");
});

test("normalizeRow collects typed errors for missing sku and bad values", () => {
  const missing = normalizeRow({ price: 5 });
  assert.equal(missing.ok, false);
  assert.deepEqual(
    missing.errors.map(({ code }) => code),
    ["missing-sku"],
  );

  const invalid = normalizeRow({
    sku: "SYN-0001",
    price: "cheap",
    verified_at: "tomorrow",
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(
    invalid.errors.map(({ code }) => code),
    ["invalid-value", "invalid-value"],
  );
});

test("normalizeRow normalizes status, gallery and analogs", () => {
  const { row } = normalizeRow({
    sku: "SYN-0001",
    status: " Published ",
    gallery: [" file-1 ", "", "file-2"],
    analogs: [
      { sku: " syn-0002 ", relation_type: "analog", note: " n " },
    ],
  });
  assert.equal(row.status, "published");
  assert.deepEqual(row.gallery, ["file-1", "file-2"]);
  assert.deepEqual(row.analogs, [
    { sku: "syn-0002", relation_type: "analog", note: "n", source_name: null },
  ]);

  assert.equal(normalizeRow({ sku: "S1", gallery: "file-1" }).ok, false);
  assert.equal(normalizeRow({ sku: "S1", analogs: [{}] }).ok, false);
});

test("normalizeRow rejects non-object rows", () => {
  const result = normalizeRow("not-an-object");
  assert.equal(result.ok, false);
  assert.equal(result.skuKey, null);
  assert.ok(result.errors.length >= 1);
});
