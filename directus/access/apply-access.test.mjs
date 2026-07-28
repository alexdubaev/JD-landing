import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPermissionPayload,
  permissionMatches,
} from "./apply-access.mjs";

test("builds a Directus policy permission payload", () => {
  const payload = buildPermissionPayload("policy-id", {
    collection: "products",
    action: "read",
  });

  assert.deepEqual(payload, {
    policy: "policy-id",
    collection: "products",
    action: "read",
    permissions: null,
    validation: null,
    presets: null,
    fields: ["*"],
  });
});

test("detects whether an existing permission matches the blueprint", () => {
  const desired = {
    policy: "policy-id",
    collection: "products",
    action: "read",
    permissions: null,
    validation: null,
    presets: null,
    fields: ["*"],
  };

  assert.equal(permissionMatches({ id: 1, ...desired }, desired), true);
  assert.equal(
    permissionMatches(
      { id: 1, ...desired, permissions: { status: { _eq: "published" } } },
      desired,
    ),
    false,
  );
});
