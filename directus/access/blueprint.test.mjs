import test from "node:test";
import assert from "node:assert/strict";

import { accessBlueprint } from "./blueprint.mjs";
import { schemaBlueprint } from "../schema/blueprint.mjs";

const permissionKey = ({ collection, action }) => `${collection}:${action}`;

test("defines the required non-admin roles and policies", () => {
  const roles = new Set(
    accessBlueprint.policies
      .filter(({ role }) => role)
      .map(({ role }) => role.name),
  );

  assert.deepEqual(roles, new Set([
    "API фронтенда",
    "Контент-менеджер",
    "Менеджер продаж",
    "SEO-менеджер",
    "SEO Worker",
  ]));

  const contentManager = accessBlueprint.policies.find(
    ({ key }) => key === "content_manager",
  );
  assert.deepEqual(contentManager.role.existingNames, ["Content Manager"]);

  for (const policy of accessBlueprint.policies) {
    assert.equal(policy.adminAccess, false);
    assert.equal(
      policy.appAccess,
      ["content_manager", "sales_manager", "seo_manager"].includes(policy.key),
    );
  }
});

test("public policy is closed", () => {
  const policy = accessBlueprint.policies.find(({ key }) => key === "public");

  assert.deepEqual(policy.permissions, []);
});

test("frontend API confines lead attachment file writes to its private folder", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "frontend_api",
  );
  const keys = new Set(policy.permissions.map(permissionKey));

  assert.ok(keys.has("products:read"));
  assert.ok(keys.has("categories:read"));
  assert.ok(keys.has("site_settings:read"));
  assert.ok(keys.has("home_page:read"));
  assert.ok(keys.has("directus_files:read"));
  assert.ok(keys.has("leads:create"));
  assert.ok(keys.has("directus_files:create"));
  assert.ok(keys.has("directus_files:delete"));
  assert.ok(!keys.has("leads:read"));
  assert.ok(!keys.has("leads:update"));
  assert.ok(!keys.has("leads:delete"));

  const upload = policy.permissions.find(
    ({ collection, action }) => collection === "directus_files" && action === "create",
  );
  const removal = policy.permissions.find(
    ({ collection, action }) => collection === "directus_files" && action === "delete",
  );
  assert.deepEqual(upload.validation, {
    folder: { _eq: accessBlueprint.leadAttachmentFolder.id },
  });
  assert.deepEqual(upload.presets, {
    folder: accessBlueprint.leadAttachmentFolder.id,
  });
  assert.deepEqual(removal.permissions, {
    folder: { _eq: accessBlueprint.leadAttachmentFolder.id },
  });
});

test("content managers cannot delete protected content", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "content_manager",
  );

  assert.ok(policy.permissions.some(
    ({ collection, action }) => collection === "products" && action === "create",
  ));
  assert.ok(policy.permissions.some(
    ({ collection, action }) => collection === "home_page" && action === "update",
  ));
  assert.ok(!policy.permissions.some(({ action }) => action === "delete"));
  assert.ok(!policy.permissions.some(({ collection }) => collection === "leads"));
});

test("content manager uploads are placed in the public assets folder", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "content_manager",
  );
  const upload = policy.permissions.find(
    ({ collection, action }) =>
      collection === "directus_files" && action === "create",
  );

  assert.deepEqual(upload.presets, {
    folder: accessBlueprint.publicAssetFolder.id,
  });
});

test("sales managers can read attachment files only from the private lead folder", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "sales_manager",
  );
  const keys = new Set(policy.permissions.map(permissionKey));

  assert.deepEqual(keys, new Set([
    "leads:read",
    "leads:update",
    "directus_files:read",
    "orders:read",
    "orders:update",
    "order_items:read",
  ]));
  const filesRead = policy.permissions.find(
    ({ collection, action }) => collection === "directus_files" && action === "read",
  );
  assert.deepEqual(filesRead.permissions, {
    folder: { _eq: accessBlueprint.leadAttachmentFolder.id },
  });
});

test("SEO managers can update SEO-bearing collections but not leads", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "seo_manager",
  );
  const keys = new Set(policy.permissions.map(permissionKey));

  assert.ok(keys.has("pages:update"));
  assert.ok(keys.has("home_page:update"));
  assert.ok(keys.has("categories:update"));
  assert.ok(keys.has("products:update"));
  assert.ok(keys.has("faq_items:update"));
  assert.ok(keys.has("page_sections:update"));
  assert.ok(keys.has("seo_redirects:update"));
  assert.ok(!policy.permissions.some(({ collection }) => collection === "leads"));
});

test("all permissions are Directus 12 Core compatible", () => {
  for (const policy of accessBlueprint.policies) {
    for (const permission of policy.permissions) {
      assert.ok(
        permission.permissions === null || typeof permission.permissions === "object",
      );
      assert.ok(
        permission.validation === null || typeof permission.validation === "object",
      );
      assert.ok(
        Array.isArray(permission.fields) && permission.fields.length > 0,
      );
    }
  }
});

test("all custom permission collections exist in the schema", () => {
  const schemaCollections = new Set(
    schemaBlueprint.collections.map(({ name }) => name),
  );

  for (const policy of accessBlueprint.policies) {
    for (const permission of policy.permissions) {
      if (permission.collection.startsWith("directus_")) continue;
      assert.ok(
        schemaCollections.has(permission.collection),
        `${policy.key} references ${permission.collection}`,
      );
    }
  }
});

test("SEO Worker has endpoint-only Core access", () => {
  const policy = accessBlueprint.policies.find(({ key }) => key === "seo_worker");
  assert.ok(policy);
  assert.equal(policy.appAccess, false);
  assert.equal(policy.adminAccess, false);
  assert.deepEqual(policy.permissions, []);
});
