import test from "node:test";
import assert from "node:assert/strict";

import {
  OPERATIONS_FIELDS,
  PROFILE_NAMES,
  PROFILES,
  assertProfileApproval,
  evaluateProfileApproval,
  getProfile,
  isRelationInput,
  isWritableField,
} from "./profiles.mjs";

test("INVARIANT 9: operations-default allowlist is exactly the 7 ADR-003 fields", () => {
  const profile = getProfile("operations-default");
  assert.deepEqual([...profile.fields], [
    "price",
    "price_status",
    "availability_status",
    "delivery_status",
    "source_name",
    "source_url",
    "verified_at",
  ]);
  assert.equal(profile.fields.length, 7);
  assert.deepEqual([...profile.fields], [...OPERATIONS_FIELDS]);
  assert.equal(
    profile.fields.includes("title"),
    false,
    "editorial fields never leak into the default profile",
  );
});

test("defines exactly the six contract profiles", () => {
  assert.deepEqual([...PROFILE_NAMES], [
    "operations-default",
    "trusted-weight",
    "editorial-opt-in",
    "media-opt-in",
    "codes-opt-in",
    "analogs-opt-in",
  ]);
  assert.equal(PROFILE_NAMES.length, 6);
});

test("only operations-default runs without approval; the other five are opt-in", () => {
  assert.equal(PROFILES["operations-default"].optIn, false);
  for (const name of PROFILE_NAMES.slice(1)) {
    assert.equal(PROFILES[name].optIn, true, `${name} must be opt-in`);
  }
});

test("every opt-in allowlist extends the operational base", () => {
  for (const name of PROFILE_NAMES) {
    for (const field of OPERATIONS_FIELDS) {
      assert.ok(
        PROFILES[name].fields.includes(field),
        `${name} must keep the operational field ${field}`,
      );
    }
  }
  assert.deepEqual([...PROFILES["trusted-weight"].fields], [
    ...OPERATIONS_FIELDS,
    "weight",
  ]);
  assert.deepEqual([...PROFILES["codes-opt-in"].fields], [
    ...OPERATIONS_FIELDS,
    "mpn",
  ]);
  assert.ok(PROFILES["media-opt-in"].fields.includes("main_image"));
  assert.ok(PROFILES["media-opt-in"].fields.includes("gallery"));
  assert.ok(PROFILES["editorial-opt-in"].fields.includes("title"));
  assert.ok(!PROFILES["editorial-opt-in"].fields.includes("slug"));
  assert.ok(!PROFILES["editorial-opt-in"].fields.includes("category"));
  assert.ok(!PROFILES["editorial-opt-in"].fields.includes("seo_title"));
});

test("no profile can write status, slug, category or SEO fields", () => {
  const neverWritable = [
    "status",
    "slug",
    "sku",
    "category",
    "seo_title",
    "seo_description",
    "og_image",
    "currency",
    "specifications",
    "documents",
    "is_featured",
    "show_on_homepage",
    "reviewed_by",
  ];
  for (const name of PROFILE_NAMES) {
    for (const field of neverWritable) {
      assert.equal(
        isWritableField(PROFILES[name], field),
        false,
        `${name} must never write ${field}`,
      );
    }
  }
});

test("analogs is a relation input only under analogs-opt-in", () => {
  assert.equal(isRelationInput(PROFILES["analogs-opt-in"], "analogs"), true);
  for (const name of PROFILE_NAMES.filter((candidate) => candidate !== "analogs-opt-in")) {
    assert.equal(isRelationInput(PROFILES[name], "analogs"), false);
  }
});

test("approval guard refuses opt-in profiles without a reference", () => {
  assert.throws(
    () => assertProfileApproval(getProfile("editorial-opt-in"), undefined),
    /approval-ref.*ADR-003/s,
  );
  assert.throws(
    () => assertProfileApproval(getProfile("trusted-weight"), "   "),
    /approval-ref/s,
  );
  for (const ref of [null, undefined, "", "  "]) {
    assert.equal(
      evaluateProfileApproval(getProfile("analogs-opt-in"), ref).ok,
      false,
    );
  }
  assert.doesNotThrow(() =>
    assertProfileApproval(getProfile("editorial-opt-in"), "APPROVAL-2026-08-17"),
  );
  assert.doesNotThrow(() =>
    assertProfileApproval(getProfile("operations-default"), null),
  );
});

test("getProfile lists known profiles on unknown input and profiles are frozen", () => {
  assert.throws(() => getProfile("warehouse-stock"), /operations-default/s);
  assert.throws(
    () => {
      PROFILES["operations-default"].fields.push("title");
    },
    TypeError,
    "profile allowlists are immutable",
  );
});
