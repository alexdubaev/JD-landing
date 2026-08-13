import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBaselineArtifactFiles,
  captureBaseline,
  createReadOnlyClientFromEnvironment,
} from "./capture-baseline.mjs";

const responseFor = (path) => {
  const offset = Number(new URL(path, "http://directus.test").searchParams.get("offset") ?? 0);
  if (path.startsWith("/items/") && !path.includes("aggregate") && offset > 0) {
    return [];
  }
  if (path.startsWith("/items/products?")) {
    return [
      {
        id: "p2",
        status: "published",
        slug: "part-2",
        sku: "SKU-2",
        category: "c1",
        main_image: null,
        gallery: ["f2", "f3"],
      },
      {
        id: "p1",
        status: "published",
        slug: "part-1",
        sku: "SKU-1",
        category: "c1",
        main_image: "f1",
        gallery: ["f1"],
      },
    ];
  }
  if (path.startsWith("/items/categories?")) {
    return [{ id: "c1", status: "published", slug: "parts", parent: null }];
  }
  if (path.startsWith("/items/articles?")) {
    return [{ id: "a1", status: "published", slug: "guide" }];
  }
  if (path.startsWith("/items/pages?")) {
    return [{ id: "pg1", status: "published", slug: "about" }];
  }
  if (path.startsWith("/items/page_sections?")) {
    return [{ id: "s1", page: "pg1", home_page: null, status: "published" }];
  }
  if (path.startsWith("/items/faq_items?")) {
    return [{ id: "f1", page: "pg1", category: null, product: null, status: "published" }];
  }
  if (path.startsWith("/items/leads?")) return [{ count: { id: 4 } }];
  if (path.startsWith("/items/orders?")) return [{ count: { id: 0 } }];
  if (path.startsWith("/items/home_page?")) return [{ id: "home-1" }];
  if (path.startsWith("/collections?")) {
    return [
      { collection: "products", schema: { name: "products" }, meta: { hidden: false } },
      { collection: "categories", schema: { name: "categories" }, meta: { hidden: false } },
      { collection: "directus_users", schema: { name: "directus_users" }, meta: { hidden: false } },
    ];
  }
  if (path.startsWith("/fields?")) {
    return [{ collection: "products", field: "id", type: "uuid", meta: { special: ["uuid"] } }];
  }
  if (path.startsWith("/relations?")) {
    return [{ many_collection: "products", many_field: "category", one_collection: "categories", one_field: "products" }];
  }
  if (path.startsWith("/flows?")) return [{ id: "flow-1", name: "Revalidate", status: "active", trigger: "event" }];
  if (path.startsWith("/presets?")) return [{ id: 1, collection: "products", layout: "tabular", role: null }];
  if (path.startsWith("/permissions?")) return [{ id: 1, collection: "products", action: "read", fields: ["id"], policy: "policy-1" }];
  throw new Error(`Unexpected request: ${path}`);
};

const fakeClient = () => {
  const requests = [];
  return {
    requests,
    async request(path, options = {}) {
      requests.push({ path, options });
      return responseFor(path);
    },
  };
};

test("captures deterministic counts, hashes, metadata, and safe route samples", async () => {
  const client = fakeClient();
  const baseline = await captureBaseline(client, {
    capturedAt: "2026-08-13T10:00:00.000Z",
    pageSize: 500,
  });

  assert.deepEqual(baseline.counts, {
    articles: 1,
    categories: 1,
    collectionCount: 2,
    faqItems: 1,
    leads: 4,
    orders: 0,
    pageSections: 1,
    pages: 1,
    products: {
      galleryProducts: 2,
      galleryReferences: 3,
      missingCategory: 0,
      missingMainImage: 1,
      published: 2,
      total: 2,
    },
  });
  assert.deepEqual(baseline.routes, {
    article: "/articles/guide",
    category: "/catalog/parts",
    product: "/catalog/parts/part-1",
  });
  assert.match(baseline.hashes.products, /^[a-f0-9]{64}$/);
  assert.match(baseline.metadata.permissions.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(baseline).includes("buyer@example.com"), false);
  assert.equal(JSON.stringify(baseline).includes("access_token"), false);
  assert.equal(client.requests.every(({ options }) => !options.method || options.method === "GET"), true);
  assert.equal(
    client.requests.some(
      ({ path }) =>
        path.startsWith("/relations?") &&
        path.includes("fields=collection%2Cfield%2Crelated_collection") &&
        !path.includes("sort=id"),
    ),
    true,
  );
});

test("redacts leads and orders to aggregate counts", async () => {
  const client = fakeClient();
  const baseline = await captureBaseline(client, {
    capturedAt: "2026-08-13T10:00:00.000Z",
  });

  assert.deepEqual(baseline.redacted, {
    leads: { count: 4 },
    orders: { count: 0 },
  });
  assert.equal(client.requests.some(({ path }) => path.includes("/items/leads?") && path.includes("aggregate%5Bcount%5D=id")), true);
  assert.equal(client.requests.some(({ path }) => path.includes("/items/orders?") && path.includes("aggregate%5Bcount%5D=id")), true);
});

test("builds the required before-state count, schema, and relation artifacts", async () => {
  const baseline = await captureBaseline(fakeClient(), {
    capturedAt: "2026-08-13T10:00:00.000Z",
  });
  const files = buildBaselineArtifactFiles(baseline, "before");

  assert.deepEqual(Object.keys(files), [
    "baseline-before.json",
    "counts-before.json",
    "relations-before.json",
    "schema-before.json",
  ]);
  assert.deepEqual(files["counts-before.json"], baseline.counts);
  assert.deepEqual(files["schema-before.json"], baseline.details.schema);
  assert.deepEqual(files["relations-before.json"], {
    integrity: baseline.integrity,
    relations: baseline.details.relations,
  });
});

test("continues pagination when Directus caps a page below the requested limit", async () => {
  const client = fakeClient();
  const originalRequest = client.request.bind(client);
  const productPages = [
    [{ id: "p1", status: "published", slug: "part-1", sku: "1", category: "c1", main_image: null, gallery: [] }],
    [{ id: "p2", status: "published", slug: "part-2", sku: "2", category: "c1", main_image: null, gallery: [] }],
    [],
  ];
  client.request = async (path, options = {}) => {
    if (path.startsWith("/items/products?")) {
      client.requests.push({ path, options });
      const offset = Number(new URL(path, "http://directus.test").searchParams.get("offset") ?? 0);
      return productPages[offset] ?? [];
    }
    return originalRequest(path, options);
  };

  const baseline = await captureBaseline(client, {
    capturedAt: "2026-08-13T10:00:00.000Z",
    pageSize: 500,
  });

  assert.equal(baseline.counts.products.total, 2);
  assert.deepEqual(
    client.requests
      .filter(({ path }) => path.startsWith("/items/products?"))
      .map(({ path }) => new URL(path, "http://directus.test").searchParams.get("offset") ?? "0"),
    ["0", "1", "2"],
  );
});

test("chooses published route samples with valid slugs and relations", async () => {
  const client = fakeClient();
  const originalRequest = client.request.bind(client);
  client.request = async (path, options = {}) => {
    const offset = Number(new URL(path, "http://directus.test").searchParams.get("offset") ?? 0);
    if (offset > 0) return [];
    if (path.startsWith("/items/products?")) {
      return [
        { id: "p0", status: "draft", slug: "draft", sku: "0", category: null, main_image: null, gallery: [] },
        ...(await originalRequest(path, options)),
      ];
    }
    if (path.startsWith("/items/categories?")) {
      return [
        { id: "c0", status: "draft", slug: "draft-category", parent: null },
        ...(await originalRequest(path, options)),
      ];
    }
    if (path.startsWith("/items/articles?")) {
      return [
        { id: "a0", status: "draft", slug: "draft-article" },
        ...(await originalRequest(path, options)),
      ];
    }
    return originalRequest(path, options);
  };

  const baseline = await captureBaseline(client, {
    capturedAt: "2026-08-13T10:00:00.000Z",
  });

  assert.deepEqual(baseline.routes, {
    article: "/articles/guide",
    category: "/catalog/parts",
    product: "/catalog/parts/part-1",
  });
});

test("hashes only the metadata allowlist even if Directus returns extra fields", async () => {
  const withFlowSecret = (secret) => {
    const client = fakeClient();
    const originalRequest = client.request.bind(client);
    client.request = async (path, options = {}) => {
      if (path.startsWith("/flows?")) {
        return [{
          id: "flow-1",
          name: "Revalidate",
          status: "active",
          trigger: "event",
          accountability: "all",
          options: { headers: { authorization: secret } },
        }];
      }
      return originalRequest(path, options);
    };
    return client;
  };

  const first = await captureBaseline(withFlowSecret("first-secret"), {
    capturedAt: "2026-08-13T10:00:00.000Z",
  });
  const second = await captureBaseline(withFlowSecret("second-secret"), {
    capturedAt: "2026-08-13T10:00:00.000Z",
  });

  assert.equal(first.metadata.flows.sha256, second.metadata.flows.sha256);
  assert.equal(JSON.stringify(first).includes("first-secret"), false);
});

test("requires an existing token and never falls back to Directus login", () => {
  assert.throws(
    () => createReadOnlyClientFromEnvironment({ DIRECTUS_URL: "https://cms.example" }),
    /DIRECTUS_READONLY_TOKEN/,
  );
  const client = createReadOnlyClientFromEnvironment({
    DIRECTUS_URL: "https://cms.example/",
    DIRECTUS_READONLY_TOKEN: "read-only-token",
    DIRECTUS_ADMIN_EMAIL: "must-not-be-used@example.com",
    DIRECTUS_ADMIN_PASSWORD: "must-not-be-used",
  });

  assert.equal(client.baseUrl, "https://cms.example");
  assert.equal(client.token, "read-only-token");
});

test("counts orphaned category parent, section owner, and FAQ relations", async () => {
  const client = fakeClient();
  const originalRequest = client.request.bind(client);
  client.request = async (path, options = {}) => {
    const offset = Number(new URL(path, "http://directus.test").searchParams.get("offset") ?? 0);
    if (offset > 0) return [];
    if (path.startsWith("/items/categories?")) {
      return [{ id: "c1", status: "published", slug: "parts", parent: "missing-category" }];
    }
    if (path.startsWith("/items/page_sections?")) {
      return [{ id: "s1", page: "missing-page", home_page: "missing-home", status: "published" }];
    }
    if (path.startsWith("/items/faq_items?")) {
      return [{ id: "f1", page: "missing-page", category: "missing-category", product: "missing-product", status: "published" }];
    }
    return originalRequest(path, options);
  };

  const baseline = await captureBaseline(client, {
    capturedAt: "2026-08-13T10:00:00.000Z",
  });

  assert.equal(baseline.integrity.brokenRelations, 6);
});
