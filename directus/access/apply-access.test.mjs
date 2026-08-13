import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAccessBlueprint,
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
    fields: ["*"],
  });
});

test("detects whether an existing permission matches the blueprint", () => {
  const desired = {
    policy: "policy-id",
    collection: "products",
    action: "read",
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

test("renames managed legacy roles and policies without creating duplicates", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET", body: options.body });
      if (path.startsWith("/folders?")) return [{ id: "folder" }];
      if (path === "/roles?limit=-1") return [{ id: "role-1", name: "Content Manager" }];
      if (path === "/policies?limit=-1") return [{ id: "policy-1", name: "Content Manager" }];
      if (path === "/access?limit=-1") return [{ role: "role-1", policy: "policy-1" }];
      if (path.startsWith("/permissions?")) return [];
      return {};
    },
  };
  const blueprint = {
    publicAssetFolder: { id: "public-folder", name: "Public" },
    leadAttachmentFolder: { id: "lead-folder", name: "Leads" },
    policies: [{
      key: "content_manager",
      policyName: "Контент-менеджер",
      existingPolicyNames: ["Content Manager"],
      appAccess: true,
      adminAccess: false,
      permissions: [],
      role: {
        name: "Контент-менеджер",
        existingNames: ["Content Manager"],
        icon: "edit_note",
        description: "Управляет контентом сайта.",
      },
    }],
  };

  await applyAccessBlueprint(client, blueprint);

  assert.ok(requests.some(({ path, method }) => path === "/roles/role-1" && method === "PATCH"));
  assert.ok(requests.some(({ path, method }) => path === "/policies/policy-1" && method === "PATCH"));
  assert.ok(!requests.some(({ path, method }) => path === "/roles" && method === "POST"));
  assert.ok(!requests.some(({ path, method }) => path === "/policies" && method === "POST"));
});
