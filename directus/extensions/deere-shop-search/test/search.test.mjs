import test from "node:test";
import assert from "node:assert/strict";

import {
  CANDIDATE_LIMIT,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  MIN_QUERY_LENGTH,
  PRODUCT_FIELDS,
  ROUTE_PATH,
  buildSearchQueries,
  createSearchHandler,
  mapSuggestion,
  mergeSearchResults,
  normalizeCode,
  parseSearchParameters,
} from "../src/index.js";
import * as distBundle from "../dist/index.js";

// ---------------------------------------------------------------------------
// Mocked Directus endpoint context (no live Directus)
// ---------------------------------------------------------------------------

const productItem = (id, overrides = {}) => ({
  id,
  slug: `product-${id}`,
  title: `Товар ${id}`,
  sku: `SKU${id}`,
  mpn: null,
  category: { slug: "engine", title: "Двигатель" },
  ...overrides,
});

const createMockContext = ({ products, codeRows, collections, codesFail = false } = {}) => {
  const queries = [];
  const warnings = [];
  const serviceInstances = [];

  class MockItemsService {
    constructor(collection, options) {
      this.collection = collection;
      this.options = options;
      serviceInstances.push({ collection, options });
    }

    async readByQuery(query) {
      queries.push({ collection: this.collection, query });
      if (this.collection === "products") return products ?? [];
      if (codesFail) {
        const error = new Error("permission denied");
        error.code = "FORBIDDEN";
        throw error;
      }
      return codeRows ?? [];
    }
  }

  return {
    context: {
      services: { ItemsService: MockItemsService },
      database: { mock: "knex" },
      getSchema: async () => ({
        collections: Object.fromEntries(
          (collections ?? ["products", "product_codes"]).map((name) => [name, {}]),
        ),
      }),
      logger: {
        warn: (message) => warnings.push(message),
        error: () => {},
      },
    },
    queries,
    warnings,
    serviceInstances,
  };
};

const mockRequest = (query = {}, accountability = { role: "public-role" }) => ({
  query,
  accountability,
});

const mockResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return response;
};

const handlerOf = async (context, query) => {
  const response = mockResponse();
  await createSearchHandler(context)(mockRequest(query), response);
  return response;
};

const positiveLimits = (queries) =>
  queries.map(({ query }) => query.limit);

// ---------------------------------------------------------------------------
// Normalization and parameter validation
// ---------------------------------------------------------------------------

test("normalizeCode matches the backfill derivation contract", () => {
  assert.equal(normalizeCode(" re-504 836 "), "RE504836");
  assert.equal(normalizeCode("ah.128449/a"), "AH128449A");
  assert.equal(normalizeCode("RE504836"), "RE504836");
  assert.equal(normalizeCode(""), "");
  assert.equal(normalizeCode(undefined), "");
});

test("parseSearchParameters accepts valid input and applies defaults", () => {
  assert.deepEqual(parseSearchParameters({ q: " re-504 " }), {
    ok: true,
    q: "RE504",
    page: 1,
    limit: DEFAULT_PAGE_LIMIT,
  });
  assert.deepEqual(
    parseSearchParameters(new URLSearchParams("q=RE50&page=2&limit=20")),
    { ok: true, q: "RE50", page: 2, limit: 20 },
  );
  // punctuation-only input normalizes to nothing -> invalid
  assert.equal(parseSearchParameters({ q: "---" }).ok, false);
});

test("parseSearchParameters rejects invalid q, page and limit", () => {
  assert.equal(parseSearchParameters({}).ok, false);
  assert.equal(parseSearchParameters({ q: "" }).ok, false);
  assert.equal(parseSearchParameters({ q: "a" }).ok, false, "below MIN_QUERY_LENGTH");
  assert.equal(
    parseSearchParameters({ q: "A".repeat(65) }).ok,
    false,
    "above MAX_QUERY_LENGTH",
  );
  for (const page of ["0", "-1", "abc", "1.5"]) {
    assert.equal(parseSearchParameters({ q: "RE50", page }).ok, false, `page=${page}`);
  }
  for (const limit of ["0", "21", "abc", String(MAX_PAGE_LIMIT + 1)]) {
    assert.equal(parseSearchParameters({ q: "RE50", limit }).ok, false, `limit=${limit}`);
  }
  assert.equal(parseSearchParameters({ q: "RE50", limit: "20" }).ok, true, "limit 20 is allowed");
});

// ---------------------------------------------------------------------------
// Pure query builder
// ---------------------------------------------------------------------------

test("buildSearchQueries builds bounded starts_with lookups for both sources", () => {
  const plan = buildSearchQueries("re-504", { page: 3, limit: 5 });

  assert.deepEqual(plan.products, {
    collection: "products",
    query: {
      filter: {
        status: { _eq: "published" },
        _or: [
          { sku_normalized: { _starts_with: "RE504" } },
          { mpn_normalized: { _starts_with: "RE504" } },
        ],
      },
      fields: [...PRODUCT_FIELDS],
      sort: ["-popularity_score", "title"],
      limit: CANDIDATE_LIMIT,
      page: 1,
    },
  });

  assert.deepEqual(plan.codes, {
    collection: "product_codes",
    query: {
      filter: {
        is_active: { _eq: true },
        normalized_code: { _starts_with: "RE504" },
      },
      fields: ["product"],
      limit: CANDIDATE_LIMIT,
      page: 1,
    },
  });

  assert.deepEqual(plan.pagination, { page: 3, limit: 5, offset: 10 });
});

test("buildSearchQueries NEVER produces an unbounded limit (-1)", () => {
  const plan = buildSearchQueries("RE504836");
  for (const limit of positiveLimits([plan.products, plan.codes].map((entry) => ({ query: entry.query })))) {
    assert.ok(Number.isInteger(limit) && limit >= 1, `explicit positive limit expected, got ${limit}`);
    assert.notEqual(limit, -1);
  }
  assert.equal(
    PRODUCT_FIELDS.length,
    7,
    "bounded field set: id, slug, title, sku, mpn, category.slug, category.title",
  );
});

test("buildSearchQueries throws on invalid q or pagination", () => {
  assert.throws(() => buildSearchQueries("a"), RangeError);
  assert.throws(() => buildSearchQueries("A".repeat(65)), RangeError);
  assert.throws(() => buildSearchQueries("RE50", { page: 0 }), RangeError);
  assert.throws(() => buildSearchQueries("RE50", { limit: 21 }), RangeError);
  assert.throws(() => buildSearchQueries("RE50", { limit: -1 }), RangeError);
});

// ---------------------------------------------------------------------------
// Pure merge / pagination / projection
// ---------------------------------------------------------------------------

test("mergeSearchResults dedupes, keeps normalized matches first and paginates", () => {
  const normalized = [productItem("a"), productItem("b")];
  const fromCodes = [productItem("b"), productItem("c"), productItem("d")];

  const firstPage = mergeSearchResults(
    { productItems: normalized, codeProductItems: fromCodes },
    { page: 1, limit: 2 },
  );
  assert.deepEqual(firstPage.data.map(({ id }) => id), ["a", "b"]);
  assert.equal(firstPage.total, 4);
  assert.equal(firstPage.source, "codes");

  const secondPage = mergeSearchResults(
    { productItems: normalized, codeProductItems: fromCodes },
    { page: 2, limit: 2 },
  );
  assert.deepEqual(secondPage.data.map(({ id }) => id), ["c", "d"]);

  const beyond = mergeSearchResults(
    { productItems: normalized, codeProductItems: fromCodes },
    { page: 3, limit: 2 },
  );
  assert.deepEqual(beyond.data, []);
  assert.equal(beyond.total, 4);

  const codesOnly = mergeSearchResults({ productItems: [], codeProductItems: [] }, { page: 1, limit: 10 });
  assert.equal(codesOnly.source, "normalized");
});

test("mapSuggestion projects the bounded response shape", () => {
  assert.deepEqual(mapSuggestion(productItem("a", { mpn: "AH128449" })), {
    id: "a",
    slug: "product-a",
    title: "Товар a",
    sku: "SKUa",
    mpn: "AH128449",
    category: { slug: "engine", title: "Двигатель" },
  });
  assert.deepEqual(mapSuggestion(productItem("b", { category: null })), {
    id: "b",
    slug: "product-b",
    title: "Товар b",
    sku: "SKUb",
    mpn: null,
    category: null,
  });
});

// ---------------------------------------------------------------------------
// Handler with mocked services
// ---------------------------------------------------------------------------

test("handler answers with merged, deduped, paginated suggestions", async () => {
  const products = [productItem("a"), productItem("c")];
  const codeRows = [{ product: "c" }, { product: "d" }, { product: "a" }, { product: null }];
  const { context, queries } = createMockContext({ products, codeRows });

  // "c" is matched by both sources but hydrated once; "d" is fetched by id.
  const hydrated = new Map([
    ["a", products[0]],
    ["c", products[1]],
    ["d", productItem("d")],
  ]);
  context.services.ItemsService = class extends context.services.ItemsService {
    async readByQuery(query) {
      const call = { collection: this.collection, query };
      queries.push(call);
      if (this.collection === "product_codes") return codeRows;
      if (query.filter?.id?._in) {
        return query.filter.id._in.map((id) => hydrated.get(id)).filter(Boolean);
      }
      return products;
    }
  };

  const response = await handlerOf(context, { q: "RE", limit: "2" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.map(({ id }) => id), ["a", "c"]);
  assert.deepEqual(response.body.meta, { total: 3, page: 1, limit: 2, source: "codes" });
  assert.deepEqual(
    response.body.data[0],
    mapSuggestion(products[0]),
  );

  // The by-ids hydration query filters published products and stays bounded.
  const byIds = queries.find(({ query }) => query.filter?.id?._in);
  assert.ok(byIds, "products matched via codes are hydrated through a bounded by-id query");
  assert.deepEqual(byIds.query.filter.id._in, ["c", "d", "a"]);
  assert.deepEqual(byIds.query.filter.status, { _eq: "published" });
  assert.equal(byIds.query.limit, CANDIDATE_LIMIT);
});

test("handler never issues an unbounded readByQuery (limit=-1 is forbidden)", async () => {
  const { context, queries } = createMockContext({
    products: [productItem("a")],
    codeRows: [{ product: "b" }],
  });
  const response = await handlerOf(context, { q: "RE" });

  assert.equal(response.statusCode, 200);
  assert.ok(queries.length >= 2, "products + codes queries were issued");
  for (const limit of positiveLimits(queries)) {
    assert.ok(
      Number.isInteger(limit) && limit >= 1 && limit <= CANDIDATE_LIMIT,
      `every readByQuery limit must be a bounded positive integer, got ${limit}`,
    );
    assert.notEqual(limit, -1);
  }
});

test("handler returns 400 for an invalid query", async () => {
  const { context, queries } = createMockContext();
  const response = await handlerOf(context, { q: "-" });

  assert.equal(response.statusCode, 400);
  assert.ok(response.body.errors.some(({ code }) => code === "invalid-q"));
  assert.equal(queries.length, 0, "no service query is issued for invalid input");

  const badLimit = await handlerOf(context, { q: "RE50", limit: "50" });
  assert.equal(badLimit.statusCode, 400);
  assert.ok(badLimit.body.errors.some(({ code }) => code === "invalid-limit"));
});

test("handler skips product_codes when the collection is absent", async () => {
  const { context, queries } = createMockContext({
    products: [productItem("a")],
    collections: ["products"],
  });
  const response = await handlerOf(context, { q: "RE" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.meta.source, "normalized");
  assert.deepEqual(
    queries.map(({ collection }) => collection),
    ["products"],
    "no product_codes query is issued when the collection is missing",
  );
});

test("handler degrades to normalized results when product_codes fails", async () => {
  const { context, queries, warnings } = createMockContext({
    products: [productItem("a")],
    codeRows: [{ product: "b" }],
    codesFail: true,
  });
  const response = await handlerOf(context, { q: "RE" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.meta.source, "normalized");
  assert.deepEqual(response.body.data.map(({ id }) => id), ["a"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /product_codes lookup failed/);
});

test("handler never defaults to admin accountability", async () => {
  const { context, serviceInstances } = createMockContext({
    products: [productItem("a")],
    codeRows: [],
  });
  await handlerOf(context, { q: "RE" });

  for (const { options } of serviceInstances) {
    assert.ok(options.accountability, "accountability is always set");
    assert.notEqual(options.accountability, null);
    assert.notEqual(options.accountability.admin, true);
  }

  // A request without accountability (middleware regression) stays public —
  // null accountability would mean an admin bypass in Directus.
  const { context: bareContext, serviceInstances: bareInstances } =
    createMockContext({ products: [productItem("a")] });
  await createSearchHandler(bareContext)(
    { query: { q: "RE" } },
    mockResponse(),
  );
  for (const { options } of bareInstances) {
    assert.deepEqual(options.accountability, {
      role: null,
      user: null,
      admin: false,
      app: false,
    });
  }
});

test("registers GET /search on the scoped router", async () => {
  const { default: registerSearchEndpoint } = await import("../src/index.js");
  const routes = [];
  const router = {
    get(path, handler) {
      routes.push({ method: "get", path, handler });
    },
  };
  const { context } = createMockContext();

  registerSearchEndpoint(router, context);

  assert.deepEqual(routes.map(({ method, path }) => ({ method, path })), [
    { method: "get", path: "/search" },
  ]);
  assert.equal(routes[0].handler.name, "searchHandler");
  assert.equal(ROUTE_PATH, "/search");
});

test("the prebuilt dist bundle mirrors the source module", async () => {
  assert.equal(typeof distBundle.default, "function", "dist default export is the register function");
  assert.equal(typeof distBundle.buildSearchQueries, "function");
  assert.equal(distBundle.normalizeCode(" re-504 "), "RE504");

  const plan = distBundle.buildSearchQueries("RE504836", { page: 2, limit: 6 });
  assert.equal(plan.pagination.offset, 6);
  assert.notEqual(plan.products.query.limit, -1);
  assert.notEqual(plan.codes.query.limit, -1);
});
