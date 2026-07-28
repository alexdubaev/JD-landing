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
    "Frontend API",
    "Content Manager",
    "Sales Manager",
    "SEO Manager",
  ]));

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

test("frontend API reads CMS content and can only create leads", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "frontend_api",
  );
  const keys = new Set(policy.permissions.map(permissionKey));

  assert.ok(keys.has("products:read"));
  assert.ok(keys.has("categories:read"));
  assert.ok(keys.has("site_settings:read"));
  assert.ok(keys.has("directus_files:read"));
  assert.ok(keys.has("leads:create"));
  assert.ok(!keys.has("leads:read"));
  assert.ok(!keys.has("leads:update"));
  assert.ok(!keys.has("leads:delete"));
});

test("content managers cannot delete protected content", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "content_manager",
  );

  assert.ok(policy.permissions.some(
    ({ collection, action }) => collection === "products" && action === "create",
  ));
  assert.ok(!policy.permissions.some(({ action }) => action === "delete"));
  assert.ok(!policy.permissions.some(({ collection }) => collection === "leads"));
});

test("sales managers can read and update leads without delete access", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "sales_manager",
  );
  const keys = new Set(policy.permissions.map(permissionKey));

  assert.deepEqual(keys, new Set(["leads:read", "leads:update"]));
});

test("SEO managers can update SEO-bearing collections but not leads", () => {
  const policy = accessBlueprint.policies.find(
    ({ key }) => key === "seo_manager",
  );
  const keys = new Set(policy.permissions.map(permissionKey));

  assert.ok(keys.has("pages:update"));
  assert.ok(keys.has("categories:update"));
  assert.ok(keys.has("products:update"));
  assert.ok(keys.has("faq_items:update"));
  assert.ok(keys.has("seo_redirects:update"));
  assert.ok(!policy.permissions.some(({ collection }) => collection === "leads"));
});

test("all permissions are Directus 12 Core compatible", () => {
  for (const policy of accessBlueprint.policies) {
    for (const permission of policy.permissions) {
      assert.equal(permission.permissions, null);
      assert.equal(permission.validation, null);
      assert.deepEqual(permission.fields, ["*"]);
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
