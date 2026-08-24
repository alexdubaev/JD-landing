import test from "node:test";
import assert from "node:assert/strict";

import { applyWorkspace } from "./apply-workspace.mjs";

const blueprint = {
  presets: [
    {
      key: "deere-shop:products:catalog",
      bookmark: "Deere Shop · Каталог товаров",
      collection: "products",
      layout: "tabular",
      layoutQuery: {
        tabular: { fields: ["title", "sku", "status"], sort: ["title"] },
      },
      layoutOptions: {
        deereShopKey: "deere-shop:products:catalog",
        tabular: { spacing: "cozy" },
      },
    },
  ],
  dashboard: {
    key: "deere-shop:dashboard:operations",
    id: "7ed2a9a2-53f1-4b0a-8f51-6c4418ee34df",
    name: "Deere Shop · Контроль",
    icon: "fact_check",
    note: "Рабочий dashboard.",
  },
  panels: [
    {
      key: "deere-shop:products:published-count",
      id: "465837d6-83d1-4fb8-9e68-958f04ac3f1d",
      dashboard: "7ed2a9a2-53f1-4b0a-8f51-6c4418ee34df",
      name: "Опубликовано товаров",
      note: "deere-shop:products:published-count",
      icon: "inventory_2",
      showHeader: true,
      type: "metric",
      positionX: 1,
      positionY: 1,
      width: 8,
      height: 6,
      options: {
        collection: "products",
        field: "id",
        function: "count",
      },
    },
  ],
};

const emptyWorkspaceClient = (requests) => ({
  async request(path, options = {}) {
    requests.push({ path, method: options.method ?? "GET", body: options.body });
    if (path.startsWith("/presets?")) return [];
    if (path.startsWith("/dashboards?")) return [];
    if (path.startsWith("/panels?")) return [];
    if (options.method === "POST" || options.method === "PATCH") return {};
    throw new Error(`unexpected endpoint ${path}`);
  },
});

test("dry-run plans only project workspace metadata without writes", async () => {
  const requests = [];
  const actions = await applyWorkspace(emptyWorkspaceClient(requests), blueprint, {
    dryRun: true,
  });

  assert.deepEqual(actions, [
    "create preset deere-shop:products:catalog",
    "create dashboard 7ed2a9a2-53f1-4b0a-8f51-6c4418ee34df",
    "create panel deere-shop:products:published-count",
  ]);
  assert.ok(requests.every(({ method }) => method === "GET"));
  assert.ok(
    requests.every(({ path }) =>
      ["/presets?", "/dashboards?", "/panels?"].some((prefix) =>
        path.startsWith(prefix),
      ),
    ),
  );
});

test("preflights dashboard and panel ownership collisions before any write", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET" });
      if (path.startsWith("/presets?")) return [];
      if (path.startsWith("/dashboards?")) {
        return [
          {
            id: "7ed2a9a2-53f1-4b0a-8f51-6c4418ee34df",
            name: "Чужая панель управления",
            note: "not-owned",
          },
        ];
      }
      if (path.startsWith("/panels?")) {
        return [
          {
            id: "465837d6-83d1-4fb8-9e68-958f04ac3f1d",
            dashboard: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            note: "not-owned",
          },
        ];
      }
      return {};
    },
  };

  await assert.rejects(() => applyWorkspace(client, blueprint), /ownership collision/);
  assert.ok(requests.every(({ method }) => method === "GET"));
  assert.ok(requests.some(({ path }) => path.startsWith("/panels?")));
  assert.equal(
    requests.some(({ path }) =>
      decodeURIComponent(path).includes("filter[dashboard]"),
    ),
    false,
  );
});

test("apply creates Directus presets, dashboard, and panels with API field names", async () => {
  const requests = [];
  await applyWorkspace(emptyWorkspaceClient(requests), blueprint);

  const writes = requests.filter(({ method }) => method !== "GET");
  assert.deepEqual(
    writes.map(({ path, method }) => ({ path, method })),
    [
      { path: "/presets", method: "POST" },
      { path: "/dashboards", method: "POST" },
      { path: "/panels", method: "POST" },
    ],
  );

  const presetBody = JSON.parse(writes[0].body);
  assert.deepEqual(presetBody, {
    bookmark: "Deere Shop · Каталог товаров",
    collection: "products",
    layout: "tabular",
    layout_query: {
      tabular: { fields: ["title", "sku", "status"], sort: ["title"] },
    },
    layout_options: {
      deereShopKey: "deere-shop:products:catalog",
      tabular: { spacing: "cozy" },
    },
  });
  assert.equal("key" in presetBody, false);
  assert.equal("user" in presetBody, false);
  assert.equal("role" in presetBody, false);

  const dashboardBody = JSON.parse(writes[1].body);
  assert.equal(
    dashboardBody.note,
    "deere-shop:dashboard:operations\nРабочий dashboard.",
  );

  const panelBody = JSON.parse(writes[2].body);
  assert.equal(panelBody.show_header, true);
  assert.equal(panelBody.position_x, 1);
  assert.equal(panelBody.position_y, 1);
  assert.equal("key" in panelBody, false);
  assert.equal("showHeader" in panelBody, false);
});

test("preserves Directus 12 native list panel option names in the API payload", async () => {
  const requests = [];
  const listBlueprint = structuredClone(blueprint);
  listBlueprint.panels[0] = {
    ...listBlueprint.panels[0],
    key: "deere-shop:leads:unprocessed",
    id: "810d6b89-5c8f-4e4f-950e-1474e2691185",
    name: "Необработанные заявки",
    note: "deere-shop:leads:unprocessed",
    type: "list",
    options: {
      collection: "leads",
      displayTemplate: "{{created_at}} · {{name}} · {{phone}} · {{status}}",
      sortField: "created_at",
      sortDirection: "desc",
      limit: 10,
      filter: { status: { _eq: "new" } },
    },
  };

  await applyWorkspace(emptyWorkspaceClient(requests), listBlueprint);
  const panelWrite = requests.find(
    ({ path, method }) => path === "/panels" && method === "POST",
  );
  const options = JSON.parse(panelWrite.body).options;
  assert.deepEqual(options, listBlueprint.panels[0].options);
  assert.equal("fields" in options, false);
  assert.equal("sort" in options, false);
});

test("is idempotent when project workspace metadata already matches", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET" });
      if (path.startsWith("/presets?")) {
        return [
          {
            id: 17,
            bookmark: "Deere Shop · Каталог товаров",
            collection: "products",
            layout: "tabular",
            layout_query: {
              tabular: { fields: ["title", "sku", "status"], sort: ["title"] },
            },
            layout_options: {
              deereShopKey: "deere-shop:products:catalog",
              tabular: { spacing: "cozy" },
            },
          },
        ];
      }
      if (path.startsWith("/dashboards?")) {
        return [
          {
            id: "7ed2a9a2-53f1-4b0a-8f51-6c4418ee34df",
            name: "Deere Shop · Контроль",
            icon: "fact_check",
            note: "deere-shop:dashboard:operations\nРабочий dashboard.",
          },
        ];
      }
      if (path.startsWith("/panels?")) {
        return [
          {
            id: "465837d6-83d1-4fb8-9e68-958f04ac3f1d",
            dashboard: "7ed2a9a2-53f1-4b0a-8f51-6c4418ee34df",
            name: "Опубликовано товаров",
            icon: "inventory_2",
            note: "deere-shop:products:published-count",
            show_header: true,
            type: "metric",
            position_x: 1,
            position_y: 1,
            width: 8,
            height: 6,
            options: { collection: "products", field: "id", function: "count" },
          },
        ];
      }
      throw new Error(`unexpected write ${path}`);
    },
  };

  const actions = await applyWorkspace(client, blueprint);
  assert.deepEqual(actions, []);
  assert.ok(requests.every(({ method }) => method === "GET"));
});

test("rejects non-project keys before API access", async () => {
  let requested = false;
  const invalid = structuredClone(blueprint);
  invalid.presets[0].key = "owner:products";

  await assert.rejects(
    () => applyWorkspace({ request: async () => { requested = true; } }, invalid),
    /project-owned key/,
  );
  assert.equal(requested, false);
});

test("refuses to take over an existing bookmark without the stable project key", async () => {
  const client = {
    async request(path) {
      if (path.startsWith("/presets?")) {
        return [
          {
            id: 91,
            bookmark: "Deere Shop · Каталог товаров",
            collection: "products",
            layout_options: { tabular: { spacing: "cozy" } },
          },
        ];
      }
      if (path.startsWith("/dashboards?")) return [];
      if (path.startsWith("/panels?")) return [];
      throw new Error(`unexpected endpoint ${path}`);
    },
  };

  await assert.rejects(() => applyWorkspace(client, blueprint), /bookmark collision/);
});
