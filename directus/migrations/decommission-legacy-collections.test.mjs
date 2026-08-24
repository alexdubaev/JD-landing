import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_COLLECTIONS,
  collectPreconditions,
  evaluatePreconditions,
  referencesCollection,
  runDecommission,
} from "./decommission-legacy-collections.mjs";

const TARGETS = LEGACY_COLLECTIONS;

/**
 * Builds a mock Directus client whose global metadata (relations, flows,
 * presets, permissions) is shared and whose per-collection row list is
 * configurable. No live Directus is required.
 */
const mockClient = ({ rowsByCollection = {}, relations = [], flows = [], presets = [], permissions = [] } = {}) => {
  const requests = [];
  return {
    requests,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method !== "GET") return null;
      if (path.startsWith("/relations?")) return relations;
      if (path.startsWith("/flows?")) return flows;
      if (path.startsWith("/presets?")) return presets;
      if (path.startsWith("/permissions?")) return permissions;
      for (const [collection, rows] of Object.entries(rowsByCollection)) {
        if (path.startsWith(`/items/${collection}?`)) return rows;
      }
      return [];
    },
  };
};

test("targets exactly the six decommissioned legacy collections", () => {
  assert.deepEqual(TARGETS, [
    "hero_blocks",
    "advantages",
    "cta_blocks",
    "seo_text_blocks",
    "banners",
    "testimonials",
  ]);
});

test("referencesCollection detects trigger and operation collection usage", () => {
  assert.equal(
    referencesCollection(
      { options: { collection: "hero_blocks" } },
      "hero_blocks",
    ),
    true,
  );
  assert.equal(
    referencesCollection(
      { operations: [{ options: { collection: "banners" } }] },
      "banners",
    ),
    true,
  );
  assert.equal(
    referencesCollection(
      {
        operations: [
          { options: { collection_many: ["products", "testimonials"] } },
        ],
      },
      "testimonials",
    ),
    true,
  );
  assert.equal(
    referencesCollection(
      { options: { scope: ["items.create", "items.hero_blocks.update"] } },
      "hero_blocks",
    ),
    true,
  );
  assert.equal(
    referencesCollection(
      { options: { scope: ["items.create"] }, operations: [] },
      "cta_blocks",
    ),
    false,
  );
  assert.equal(
    referencesCollection(
      { options: { collection: "products" } },
      "hero_blocks",
    ),
    false,
  );
});

test("dry run plans a clean decommission and performs no writes", async () => {
  const client = mockClient();
  const result = await runDecommission(client);

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.applied, false);
  assert.deepEqual(result.deletable, TARGETS);
  assert.equal(
    client.requests.some((entry) => entry.method !== "GET"),
    false,
    "no writes in dry-run mode",
  );
  for (const name of TARGETS) {
    assert.ok(
      result.report.some(
        (entry) => entry.action === "delete collection" && entry.collection === name,
      ),
      `plan deletes ${name}`,
    );
  }
});

test("apply without --release-id is refused before any read", async () => {
  const client = mockClient();
  await assert.rejects(
    () => runDecommission(client, { apply: true }),
    /release-id/i,
  );
});

test("apply with release-id deletes only the targeted collections", async () => {
  const client = mockClient();
  const result = await runDecommission(client, {
    apply: true,
    releaseId: "R3-2026-08-14",
  });

  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R3-2026-08-14");
  const deletes = client.requests
    .filter((entry) => entry.method === "DELETE")
    .map((entry) => entry.path);
  assert.equal(deletes.length, TARGETS.length);
  for (const name of TARGETS) {
    assert.ok(
      deletes.includes(`/collections/${name}`),
      `applies DELETE /collections/${name}`,
    );
  }
  for (const name of TARGETS) {
    assert.equal(
      result.report.find(
        (entry) => entry.action === "delete collection" && entry.collection === name,
      )?.releaseId,
      "R3-2026-08-14",
    );
  }
});

test("STOPS and writes nothing when any legacy collection still has rows", async () => {
  const client = mockClient({
    rowsByCollection: { hero_blocks: [{ id: "row-1" }] },
  });
  const result = await runDecommission(client, { apply: true, releaseId: "R3" });

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.equal(result.applied, false);
  assert.deepEqual(result.deletable, []);
  const blocker = result.blockers.find(
    (entry) => entry.code === "non-empty-collection" && entry.collection === "hero_blocks",
  );
  assert.ok(blocker, "records the non-empty blocker");
  assert.equal(
    client.requests.some((entry) => entry.method === "DELETE"),
    false,
    "stopped before any delete",
  );
});

test("STOPS when another collection has an incoming FK to a target", async () => {
  const client = mockClient({
    relations: [
      {
        collection: "page_sections",
        field: "cta",
        related_collection: "cta_blocks",
        meta: { one_field: "cta" },
      },
    ],
  });
  const result = await runDecommission(client, { apply: true, releaseId: "R3" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find(
    (entry) => entry.code === "incoming-relation" && entry.collection === "cta_blocks",
  );
  assert.ok(blocker);
  assert.equal(blocker.detail, "page_sections.cta -> cta_blocks");
  assert.equal(
    client.requests.some((entry) => entry.method === "DELETE"),
    false,
  );
});

test("STOPS when a flow references a target collection", async () => {
  const client = mockClient({
    flows: [
      {
        id: "flow-1",
        name: "Archive banner",
        operations: [{ options: { collection: "banners" } }],
      },
    ],
  });
  const result = await runDecommission(client, { apply: true, releaseId: "R3" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find(
    (entry) => entry.code === "flow-reference" && entry.collection === "banners",
  );
  assert.ok(blocker);
});

test("STOPS when a preset targets a legacy collection", async () => {
  const client = mockClient({
    presets: [{ id: "preset-1", collection: "seo_text_blocks" }],
  });
  const result = await runDecommission(client, { apply: true, releaseId: "R3" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find(
    (entry) => entry.code === "preset-reference" && entry.collection === "seo_text_blocks",
  );
  assert.ok(blocker);
});

test("STOPS when a permission references a legacy collection", async () => {
  const client = mockClient({
    permissions: [
      { id: "perm-1", collection: "testimonials", action: "read" },
    ],
  });
  const result = await runDecommission(client, { apply: true, releaseId: "R3" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find(
    (entry) =>
      entry.code === "permission-reference" && entry.collection === "testimonials",
  );
  assert.ok(blocker);
  assert.match(blocker.detail, /read/);
});

test("aggregates every blocker type into a single STOP report", async () => {
  const client = mockClient({
    rowsByCollection: { advantages: [{ id: "a" }] },
    relations: [
      { collection: "pages", field: "hero", related_collection: "hero_blocks" },
    ],
    flows: [
      { id: "f1", options: { scope: ["items.cta_blocks.delete"] } },
    ],
    presets: [{ id: "p1", collection: "banners" }],
    permissions: [{ id: "perm1", collection: "testimonials", action: "read" }],
  });
  const preconditions = await collectPreconditions(client);
  const evaluation = evaluatePreconditions(preconditions);

  assert.equal(evaluation.ok, false);
  const codes = evaluation.blockers.map((entry) => `${entry.collection}:${entry.code}`).sort();
  assert.deepEqual(codes, [
    "advantages:non-empty-collection",
    "banners:preset-reference",
    "cta_blocks:flow-reference",
    "hero_blocks:incoming-relation",
    "testimonials:permission-reference",
  ]);
  // seo_text_blocks is clean and remains deletable
  assert.ok(evaluation.deletable.includes("seo_text_blocks"));
});

test("reports a target's own outgoing relations as cascade drops, not blockers", async () => {
  const ownRelation = {
    collection: "hero_blocks",
    field: "page_section",
    related_collection: "page_sections",
  };
  const client = mockClient({ relations: [ownRelation] });
  const result = await runDecommission(client);

  assert.equal(result.ok, true);
  assert.equal(result.blockers.length, 0);
  const cascade = result.report.find(
    (entry) => entry.action === "cascade-drop relation" && entry.collection === "hero_blocks",
  );
  assert.ok(cascade, "own relation is reported as a cascade drop");
  assert.equal(cascade.relation, "hero_blocks.page_section -> page_sections");
});

test("collectPreconditions is read-only and queries the documented endpoints", async () => {
  const requests = [];
  const client = {
    async request(path) {
      requests.push(path);
      if (path.startsWith("/relations?")) return [];
      if (path.startsWith("/flows?")) return [];
      if (path.startsWith("/presets?")) return [];
      if (path.startsWith("/permissions?")) return [];
      if (path.startsWith("/items/")) return [];
      return [];
    },
  };
  await collectPreconditions(client);

  for (const endpoint of ["/relations?", "/flows?", "/presets?", "/permissions?"]) {
    assert.ok(
      requests.some((path) => path.startsWith(endpoint)),
      `queries ${endpoint}`,
    );
  }
  for (const name of TARGETS) {
    assert.ok(
      requests.some((path) => path.startsWith(`/items/${name}?`)),
      `counts rows for ${name}`,
    );
  }
});
