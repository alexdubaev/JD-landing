// Task 13 (R9): stateful in-memory Directus mock for importer tests.
//
// Serves the endpoints the importer touches (collections, fields,
// paginated products / products_analogs lists, product CRUD, edge CRUD),
// actually MUTATES its store on writes (so idempotency, resume and
// rollback are tested against realistic state), records every request,
// and supports targeted write failures for interruption tests.
//
// Test-support only — never imported by production modules.

const DEFAULT_PRODUCT_FIELDS = [
  "id",
  "status",
  "sku",
  "sku_normalized",
  "mpn",
  "title",
  "slug",
  "category",
  "main_image",
  "gallery",
  "price",
  "currency",
  "price_status",
  "availability_status",
  "delivery_status",
  "source_name",
  "source_url",
  "verified_at",
  "seo_title",
  "seo_description",
  "og_image",
  "image_alt",
  "is_featured",
  "show_on_homepage",
];

const byId = (left, right) => String(left.id).localeCompare(String(right.id), "en");

export function createMockDirectus({
  products = [],
  edges = [],
  productFields = DEFAULT_PRODUCT_FIELDS,
  collections = [
    { collection: "products" },
    { collection: "products_analogs" },
    { collection: "directus_users" },
  ],
  failRules = [],
} = {}) {
  const store = {
    products: [...products],
    edges: [...edges],
  };
  const requests = [];
  const writes = [];
  let productCounter = 0;
  let edgeCounter = 0;

  const shouldFail = (path, body) => {
    for (const rule of failRules) {
      if (rule.times <= 0) continue;
      const matched =
        typeof rule.match === "function"
          ? rule.match(path, body)
          : rule.match.test(path);
      if (matched) {
        rule.times -= 1;
        return new Error(`${path} failed: HTTP 500 mock failure`);
      }
    }
    return null;
  };

  const paged = (rows, searchParams) => {
    const limit = Number(searchParams.get("limit") ?? "500");
    const page = Number(searchParams.get("page") ?? "1");
    return [...rows].sort(byId).slice((page - 1) * limit, page * limit);
  };

  return {
    store,
    requests,
    writes,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      let body = options.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = undefined;
        }
      }
      requests.push({ method, path, body });
      if (method !== "GET") {
        const failure = shouldFail(path, body);
        if (failure) throw failure;
        writes.push({ method, path, body });
      }

      const url = new URL(path, "https://directus.test");
      const params = url.searchParams;

      if (method === "GET" && path === "/collections") return collections;
      if (method === "GET" && path === "/fields/products") {
        return productFields.map((field) => ({ field }));
      }
      if (method === "GET" && path.startsWith("/items/products?")) {
        return paged(store.products, params);
      }
      if (method === "GET" && path.startsWith("/items/products_analogs?")) {
        return paged(store.edges, params);
      }
      if (method === "GET" && /^\/items\/products\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split("/").at(-1));
        const product = store.products.find((item) => String(item.id) === id);
        if (!product) throw new Error(`GET ${path} failed: HTTP 404`);
        return { ...product };
      }

      if (method === "POST" && path === "/items/products") {
        productCounter += 1;
        const created = {
          ...body,
          id: body?.id ?? `created-${productCounter}`,
        };
        store.products.push(created);
        return { ...created };
      }
      if (method === "PATCH" && /^\/items\/products\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split("/").at(-1));
        const product = store.products.find((item) => String(item.id) === id);
        if (!product) throw new Error(`PATCH ${path} failed: HTTP 404`);
        Object.assign(product, body);
        return { ...product };
      }
      if (method === "DELETE" && /^\/items\/products\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split("/").at(-1));
        const index = store.products.findIndex((item) => String(item.id) === id);
        if (index === -1) throw new Error(`DELETE ${path} failed: HTTP 404`);
        store.products.splice(index, 1);
        return null;
      }
      if (method === "POST" && path === "/items/products_analogs") {
        edgeCounter += 1;
        const created = { ...body, id: body?.id ?? `edge-${edgeCounter}` };
        store.edges.push(created);
        return { ...created };
      }
      if (
        method === "DELETE" &&
        /^\/items\/products_analogs\/[^/]+$/.test(path)
      ) {
        const id = decodeURIComponent(path.split("/").at(-1));
        const index = store.edges.findIndex((item) => String(item.id) === id);
        if (index === -1) throw new Error(`DELETE ${path} failed: HTTP 404`);
        store.edges.splice(index, 1);
        return null;
      }

      throw new Error(`mock does not serve ${method} ${path}`);
    },
  };
}

export const MOCK_PRODUCT_FIELDS = DEFAULT_PRODUCT_FIELDS;

export const mockProduct = (id, overrides = {}) => ({
  id,
  status: "published",
  sku: `SKU-${id}`,
  sku_normalized: `SKU-${id.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
  price: "1000.00",
  price_status: "fixed",
  availability_status: "on_request",
  delivery_status: null,
  source_name: null,
  source_url: null,
  verified_at: null,
  ...overrides,
});
