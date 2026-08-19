import test from "node:test";
import assert from "node:assert/strict";

import {
  PREVIEW_ROUTE_PATH,
  createPreviewHandler,
} from "../src/index.js";

const VERSION_ID = "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000";
const ARTICLE_ITEM = "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000";
const PREVIEW_SECRET = "preview-secret-value-for-tests";
const PREVIEW_CONSUME_URL = "https://deere-shop.example/api/preview/consume";

const createContext = (envOverrides = {}) => {
  const queries = [];
  class MockItemsService {
    constructor(collection, options) {
      this.collection = collection;
      this.options = options;
    }

    async readByQuery(query) {
      queries.push({ collection: this.collection, query });
      return [{
        id: VERSION_ID,
        key: "r12-draft",
        collection: "articles",
        item: ARTICLE_ITEM,
      }];
    }
  }

  return {
    queries,
    context: {
      services: { ItemsService: MockItemsService },
      database: { mock: "knex" },
      getSchema: async () => ({ collections: { directus_versions: {} } }),
      env: {
        PREVIEW_SECRET,
        NEXT_PREVIEW_CONSUME_URL: PREVIEW_CONSUME_URL,
        ...envOverrides,
      },
      logger: { error() {} },
    },
  };
};

const response = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  status(code) { this.statusCode = code; return this; },
  set(headers) { Object.assign(this.headers, headers); return this; },
  send(body) { this.body = body; return this; },
});

test("preview bridge rejects a request with no authenticated Directus user", async () => {
  const { context, queries } = createContext();
  const res = response();

  await createPreviewHandler(context)(
    { params: { collection: "articles", item: ARTICLE_ITEM }, query: { version: "r12-draft" } },
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body, "Forbidden");
  assert.equal(queries.length, 0);
});

test("preview bridge posts a short-lived signed token to Next without exposing its secret or version in a URL", async () => {
  const { context, queries } = createContext();
  const res = response();

  await createPreviewHandler(context)(
    {
      params: { collection: "articles", item: ARTICLE_ITEM },
      query: { version: "r12-draft" },
      accountability: { user: "author-id", role: "editor-role", admin: false },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.headers["Referrer-Policy"], "no-referrer");
  assert.match(res.headers["Content-Security-Policy"], /form-action https:\/\/deere-shop\.example/u);
  assert.match(res.body, /<form method="post" action="https:\/\/deere-shop\.example\/api\/preview\/consume">/u);
  assert.match(res.body, /name="token"/u);
  assert.doesNotMatch(res.body, new RegExp(PREVIEW_SECRET, "u"));
  assert.doesNotMatch(res.body, /[?&]version=/u);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0], {
    collection: "directus_versions",
    query: {
      filter: {
        collection: { _eq: "articles" },
        item: { _eq: ARTICLE_ITEM },
        key: { _eq: "r12-draft" },
      },
      fields: ["id", "key", "collection", "item"],
      limit: 1,
    },
  });
});

test("preview bridge permits an HTTP consume endpoint only on loopback staging", async () => {
  const { context } = createContext({
    NEXT_PREVIEW_CONSUME_URL: "http://127.0.0.1:3000/api/preview/consume",
  });
  const res = response();

  await createPreviewHandler(context)(
    {
      params: { collection: "articles", item: ARTICLE_ITEM },
      query: { version: "r12-draft" },
      accountability: { user: "author-id", role: "editor-role", admin: false },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
});

test("preview bridge registers routes only for the approved editorial collections", async () => {
  const { context } = createContext();
  const routes = [];
  const { default: registerEndpoint } = await import("../src/index.js");

  registerEndpoint({
    get(path, handler) { routes.push({ path, handler }); },
  }, context);

  assert.deepEqual(routes.map(({ path }) => path), [
    "/search",
    PREVIEW_ROUTE_PATH,
  ]);
});
