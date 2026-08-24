import { createHmac } from "node:crypto";

// deere-shop-search — Directus endpoint extension (zero dependencies).
//
// Registers GET /deere-shop/search (the extension mounts at /deere-shop,
// derived from the package.json "name" field; the route below adds /search).
// The endpoint answers SKU/OEM lookups for the DEERE-SHOP catalog through the
// indexed normalized columns instead of a full catalog scan:
//
//   GET /deere-shop/search?q=re-5048&page=1&limit=6
//   -> { data: [{id,slug,title,sku,mpn,category:{slug,title}}], meta:{total,page,limit,source} }
//
// Contract:
// - q is required and must normalize (uppercase, trim, strip non-alphanumerics
//   — the same derivation as the backfill migration) to 2..64 characters,
//   otherwise 400;
// - page >= 1 (default 1); limit 1..20 (default 10), otherwise 400;
// - every Directus query carries an explicit positive numeric limit —
//   limit=-1 (unbounded) is FORBIDDEN here, the bounded candidate window is
//   CANDIDATE_LIMIT;
// - only published products and only the bounded result fields are returned;
// - product_codes is optional: a missing collection or a failing lookup
//   degrades to normalized-only results instead of breaking the search.

export const ROUTE_PATH = "/search";
export const PREVIEW_ROUTE_PATH = "/preview/:collection/:item";

const PREVIEW_COLLECTIONS = new Set(["articles", "pages", "home_page"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SAFE_VERSION_KEY = /^[\w][\w.-]*$/u;
const PREVIEW_TTL_SECONDS = 15 * 60;

export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 20;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 64;

/**
 * Bounded candidate window per source query. Both sources are merged and
 * deduped in memory before pagination; the window keeps worst-case cost
 * bounded on shared-prefix queries (e.g. "RE").
 */
export const CANDIDATE_LIMIT = 200;

export const SEARCH_SORT = ["-popularity_score", "title"];

export const PRODUCT_FIELDS = [
  "id",
  "slug",
  "title",
  "sku",
  "mpn",
  "category.slug",
  "category.title",
];

/**
 * The shared normalization contract: uppercase, trim, and strip every
 * non-alphanumeric character. Identical logic lives in
 * migrations/backfill-product-search.mjs so stored keys and query keys agree.
 */
export function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

const parameter = (params, key) => {
  if (!params) return null;
  if (typeof params.get === "function") return params.get(key);
  const value = params[key];
  return value === undefined || value === null ? null : String(value);
};

const parseStrictPositiveInt = (raw) => {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return value >= 1 ? value : null;
};

/**
 * Pure validation of the raw query parameters (accepts an Express req.query
 * object or a URLSearchParams). Returns { ok: true, q, page, limit } or
 * { ok: false, errors: [{ code, message }] }.
 */
export function parseSearchParameters(params) {
  const errors = [];

  const rawQuery = (parameter(params, "q") ?? "").trim();
  const q = normalizeCode(rawQuery);
  if (!rawQuery) {
    errors.push({ code: "missing-q", message: "q is required" });
  } else if (q.length < MIN_QUERY_LENGTH) {
    errors.push({
      code: "invalid-q",
      message: `q must normalize to at least ${MIN_QUERY_LENGTH} alphanumeric characters`,
    });
  } else if (q.length > MAX_QUERY_LENGTH) {
    errors.push({
      code: "invalid-q",
      message: `q must normalize to at most ${MAX_QUERY_LENGTH} alphanumeric characters`,
    });
  }

  const rawPage = parameter(params, "page");
  let page = 1;
  if (rawPage !== null && rawPage !== "") {
    const parsed = parseStrictPositiveInt(rawPage);
    if (parsed === null) {
      errors.push({ code: "invalid-page", message: "page must be an integer >= 1" });
    } else {
      page = parsed;
    }
  }

  const rawLimit = parameter(params, "limit");
  let limit = DEFAULT_PAGE_LIMIT;
  if (rawLimit !== null && rawLimit !== "") {
    const parsed = parseStrictPositiveInt(rawLimit);
    if (parsed === null || parsed > MAX_PAGE_LIMIT) {
      errors.push({
        code: "invalid-limit",
        message: `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
      });
    } else {
      limit = parsed;
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, q, page, limit };
}

const assertValidPagination = (page, limit) => {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError("page must be an integer >= 1");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
  }
};

/**
 * PURE query builder: given a raw query and pagination, returns the two
 * bounded Directus readByQuery payloads (products by normalized starts_with,
 * active product_codes by normalized_code starts_with) plus the in-memory
 * pagination slice. Every returned query carries an explicit positive numeric
 * limit — never -1.
 */
export function buildSearchQueries(q, { page = 1, limit = DEFAULT_PAGE_LIMIT } = {}) {
  const normalizedQuery = normalizeCode(q);
  if (normalizedQuery.length < MIN_QUERY_LENGTH || normalizedQuery.length > MAX_QUERY_LENGTH) {
    throw new RangeError(
      `q must normalize to ${MIN_QUERY_LENGTH}..${MAX_QUERY_LENGTH} alphanumeric characters`,
    );
  }
  assertValidPagination(page, limit);

  return {
    products: {
      collection: "products",
      query: {
        filter: {
          status: { _eq: "published" },
          _or: [
            { sku_normalized: { _starts_with: normalizedQuery } },
            { mpn_normalized: { _starts_with: normalizedQuery } },
          ],
        },
        fields: [...PRODUCT_FIELDS],
        sort: [...SEARCH_SORT],
        limit: CANDIDATE_LIMIT,
        page: 1,
      },
    },
    codes: {
      collection: "product_codes",
      query: {
        filter: {
          is_active: { _eq: true },
          normalized_code: { _starts_with: normalizedQuery },
        },
        fields: ["product"],
        limit: CANDIDATE_LIMIT,
        page: 1,
      },
    },
    pagination: { page, limit, offset: (page - 1) * limit },
  };
}

/**
 * PURE merge: dedupes the candidate products (normalized matches first, then
 * code-only matches), reports the merged total, and slices the requested page.
 */
export function mergeSearchResults(
  { productItems = [], codeProductItems = [] } = {},
  { page = 1, limit = DEFAULT_PAGE_LIMIT } = {},
) {
  assertValidPagination(page, limit);

  const seen = new Set();
  const merged = [];
  for (const item of [...productItems, ...codeProductItems]) {
    if (!item || item.id === undefined || item.id === null) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  const offset = (page - 1) * limit;
  return {
    data: merged.slice(offset, offset + limit),
    total: merged.length,
    candidateLimitReached: merged.length >= CANDIDATE_LIMIT,
    source: codeProductItems.length > 0 ? "codes" : "normalized",
  };
}

/**
 * Projects a bounded product item onto the endpoint response shape.
 */
export function mapSuggestion(item) {
  return {
    id: item?.id ?? null,
    slug: item?.slug ?? null,
    title: item?.title ?? null,
    sku: item?.sku ?? null,
    mpn: item?.mpn ?? null,
    category: item?.category
      ? {
          slug: item.category.slug ?? null,
          title: item.category.title ?? null,
        }
      : null,
  };
}

const EMPTY_ACCOUNTABILITY = { role: null, user: null, admin: false, app: false };

const isUuid = (value) => typeof value === "string" && UUID_PATTERN.test(value);

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const signPreviewToken = (context, secret, now = Date.now()) => {
  const encoded = Buffer.from(JSON.stringify({
    ...context,
    exp: Math.floor(now / 1000) + PREVIEW_TTL_SECONDS,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
};

const previewForm = (consumeUrl, token) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Live Preview</title></head>
<body><form method="post" action="${escapeHtml(consumeUrl)}"><input type="hidden" name="token" value="${escapeHtml(token)}"></form><script>document.forms[0].submit()</script></body></html>`;

/**
 * Returns an auto-posting form for an authenticated Studio user. Directus
 * validates the current user's access before the signature is minted; Next.js
 * validates it again before it sets the httpOnly draft cookie.
 */
export function createPreviewHandler(context) {
  const { services, database, getSchema, logger, env = process.env } = context ?? {};

  return async function previewHandler(req, res) {
    if (!req?.accountability?.user) {
      res.status(403).send("Forbidden");
      return;
    }
    const collection = req.params?.collection;
    const item = req.params?.item;
    const versionKey = req.query?.version;
    if (
      !PREVIEW_COLLECTIONS.has(collection) ||
      !isUuid(item) ||
      typeof versionKey !== "string" ||
      !SAFE_VERSION_KEY.test(versionKey)
    ) {
      res.status(404).send("Not found");
      return;
    }
    const secret = env.PREVIEW_SECRET;
    const consumeUrl = env.NEXT_PREVIEW_CONSUME_URL;
    let destination;
    try {
      destination = new URL(consumeUrl);
    } catch {
      res.status(503).send("Preview unavailable");
      return;
    }
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const isLoopbackHttp =
      destination.protocol === "http:" && loopbackHosts.has(destination.hostname);
    if ((destination.protocol !== "https:" && !isLoopbackHttp) || !secret) {
      res.status(503).send("Preview unavailable");
      return;
    }

    try {
      const schema = await getSchema();
      const versions = new services.ItemsService("directus_versions", {
        schema,
        accountability: req.accountability,
        knex: database,
      });
      const rows = await versions.readByQuery({
        filter: {
          collection: { _eq: collection },
          item: { _eq: item },
          key: { _eq: versionKey },
        },
        fields: ["id", "key", "collection", "item"],
        limit: 1,
      });
      const version = rows?.[0];
      if (
        !isUuid(version?.id) ||
        version?.key !== versionKey ||
        version?.collection !== collection ||
        version?.item !== item
      ) {
        res.status(404).send("Not found");
        return;
      }
      const token = signPreviewToken({
        collection,
        id: item,
        version: version.id,
        versionKey,
      }, secret);
      res.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; form-action ${destination.origin}; base-uri 'none'; frame-ancestors 'self'`,
      }).status(200).send(previewForm(destination.toString(), token));
    } catch (error) {
      logger?.error?.(`deere-shop preview bridge failed: ${error?.message ?? error}`);
      res.status(503).send("Preview unavailable");
    }
  };
}

/**
 * Builds the Express route handler from the Directus endpoint context
 * ({ services, database, getSchema, logger }). Separated from the register
 * function so tests can drive it with mocked services.
 */
export function createSearchHandler(context) {
  const { services, database, getSchema, logger } = context ?? {};

  return async function searchHandler(req, res) {
    const parameters = parseSearchParameters(req?.query);
    if (!parameters.ok) {
      res.status(400).json({ errors: parameters.errors });
      return;
    }

    let plan;
    try {
      plan = buildSearchQueries(parameters.q, {
        page: parameters.page,
        limit: parameters.limit,
      });
    } catch (error) {
      res
        .status(400)
        .json({ errors: [{ code: "invalid-parameters", message: error.message }] });
      return;
    }

    try {
      const schema = await getSchema();
      const serviceOptions = {
        schema,
        // NEVER default to null accountability: null means admin bypass in
        // Directus. A request without accountability behaves as public.
        accountability: req?.accountability ?? EMPTY_ACCOUNTABILITY,
        knex: database,
      };

      const productsService = new services.ItemsService(
        plan.products.collection,
        serviceOptions,
      );
      const productItems = await productsService.readByQuery(plan.products.query);

      // product_codes is optional (owner-gated rollout): a missing collection
      // or a failing lookup degrades to normalized-only results.
      let codeProductItems = [];
      if (Boolean(schema?.collections?.[plan.codes.collection])) {
        try {
          const codesService = new services.ItemsService(
            plan.codes.collection,
            serviceOptions,
          );
          const codeRows = await codesService.readByQuery(plan.codes.query);
          const productIds = [
            ...new Set((codeRows ?? []).map((row) => row?.product).filter(Boolean)),
          ];
          if (productIds.length > 0) {
            codeProductItems = await productsService.readByQuery({
              filter: {
                status: { _eq: "published" },
                id: { _in: productIds },
              },
              fields: [...PRODUCT_FIELDS],
              sort: [...SEARCH_SORT],
              limit: CANDIDATE_LIMIT,
              page: 1,
            });
          }
        } catch (error) {
          logger?.warn?.(
            `deere-shop-search: product_codes lookup failed, continuing with normalized results: ${
              error?.message ?? error
            }`,
          );
        }
      }

      const merged = mergeSearchResults(
        { productItems, codeProductItems },
        { page: parameters.page, limit: parameters.limit },
      );

      res.json({
        data: merged.data.map(mapSuggestion),
        meta: {
          total: merged.total,
          page: parameters.page,
          limit: parameters.limit,
          source: merged.source,
        },
      });
    } catch (error) {
      const forbidden = error?.code === "FORBIDDEN";
      logger?.error?.(
        `deere-shop-search: search failed: ${error?.message ?? error}`,
      );
      res
        .status(forbidden ? 403 : 500)
        .json({ error: forbidden ? "forbidden" : "search_failed" });
    }
  };
}

/**
 * Directus endpoint entrypoint: mounts GET /search on the scoped router the
 * extension manager provides. Plain function export (no SDK helpers needed —
 * the bundle is dependency-free by design).
 */
export default function registerSearchEndpoint(router, context) {
  router.get(ROUTE_PATH, createSearchHandler(context));
  router.get(PREVIEW_ROUTE_PATH, createPreviewHandler(context));
}
