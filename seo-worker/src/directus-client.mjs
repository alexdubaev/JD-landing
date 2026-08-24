// seo-worker/src/directus-client.mjs
//
// Minimal Directus REST client. The worker talks to Directus only through this
// client, and the client reads its token/URL from config (which comes from env
// at runtime). No token or URL is ever hardcoded in this package.
//
// The client is dependency-free (uses the global `fetch` available in Node 20+)
// and accepts an injected `fetchImpl` so callers/tests can substitute a fake
// transport without touching the network.

import { renderDraftHtml } from "./planner.mjs";

/**
 * Build a Directus REST client bound to a config (URL + token from env).
 *
 * @param {{
 *   directusUrl: string|null,
 *   directusToken: string|null,
 *   tokenSource?: string|null,
 *   fetchImpl?: typeof fetch
 * }} config
 * @returns {{
 *   request: (method: string, path: string, body?: object) => Promise<any>,
 *   getItems: (collection: string, query?: object) => Promise<any>,
 *   getItem: (collection: string, id: string, query?: object) => Promise<any>,
 *   createItem: (collection: string, body: object) => Promise<any>,
 *   updateItem: (collection: string, id: string, body: object) => Promise<any>,
 * }}
 */
export function createDirectusClient(config, { fetchImpl, timeoutMs } = {}) {
  const fetchFn = fetchImpl || config?.fetchImpl || fetch;

  const baseUrl = config?.directusUrl ?? config?.baseUrl;
  const token = config?.directusToken ?? config?.token;
  if (!config || !baseUrl) {
    throw new Error('directus-client: config.directusUrl is required (from DIRECTUS_URL env)');
  }
  // A token MUST be supplied at runtime. We deliberately do NOT fall back to any
  // hardcoded value: an absent token is a hard failure, never a silent public
  // (unauthenticated) write.
  if (!token) {
    throw new Error(
      'directus-client: config.directusToken is required (from SEO_WORKER_TOKEN env); no fallback token exists',
    );
  }

  const base = baseUrl.replace(/\/+$/, '');
  const requestTimeoutMs = timeoutMs ?? config.timeoutMs ?? config.requestTimeoutMs ?? 5000;

  async function request(method, path, body) {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    const init = { method, headers, signal: AbortSignal.timeout(requestTimeoutMs) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetchFn(url, init);
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!response.ok) {
      const message =
        (json && json.errors && json.errors[0] && json.errors[0].message) ||
        `Directus ${method} ${path} failed: HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.url = url;
      throw error;
    }

    return json && json.data !== undefined ? json.data : json;
  }

  function buildQuery(query) {
    if (!query || Object.keys(query).length === 0) return '';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  return {
    request,
    getItems(collection, query) {
      return request('GET', `/items/${collection}${buildQuery(query)}`);
    },
    getItem(collection, id, query) {
      return request('GET', `/items/${collection}/${encodeURIComponent(id)}${buildQuery(query)}`);
    },
    createItem(collection, body) {
      return request('POST', `/items/${collection}`, body);
    },
    updateItem(collection, id, body) {
      return request('PATCH', `/items/${collection}/${encodeURIComponent(id)}`, body);
    },
    async listPublishedInputs({ limit = 100 } = {}) {
      const fields = 'id,status,slug,title,seo_title,seo_description';
      const collections = ['products', 'categories', 'pages'];
      const data = {};
      for (const collection of collections) {
        data[collection] = await request(
          'GET',
          `/items/${collection}?filter[status][_eq]=published&fields=${fields}&limit=${encodeURIComponent(limit)}`,
        );
      }
      return {
        products: Array.isArray(data.products) ? data.products : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
        pages: Array.isArray(data.pages) ? data.pages : [],
      };
    },
    async upsertWorkItem(item) {
      const existing = await request(
        'GET',
        `/items/seo_work_items?filter[dedupe_key][_eq]=${encodeURIComponent(item.dedupe_key)}&limit=1`,
      );
      const row = Array.isArray(existing) ? existing[0] : null;
      if (row?.id) return updateItem('seo_work_items', row.id, item);
      try {
        return await request('POST', '/items/seo_work_items', item);
      } catch (error) {
        // A concurrent worker may win the unique dedupe race between GET and
        // POST. Re-read and patch the winner; never create a second item.
        if (![400, 409].includes(error.status)) throw error;
        const winner = await request(
          'GET',
          `/items/seo_work_items?filter[dedupe_key][_eq]=${encodeURIComponent(item.dedupe_key)}&limit=1`,
        );
        if (!winner?.[0]?.id) throw error;
        return updateItem('seo_work_items', winner[0].id, item);
      }
    },
    claimApproved(limit = 10) {
      return request('POST', '/seo-factory/claim', { limit });
    },
    releaseClaim(id, error) {
      return request('POST', '/seo-factory/release', { id, error: String(error?.message ?? error ?? 'unknown') });
    },
    completeClaim(id, draftId) {
      return request('POST', '/seo-factory/complete', { id, draftId });
    },
    async processApprovedDrafts({ limit = 10 } = {}) {
      const claimed = await this.claimApproved(limit);
      const rows = Array.isArray(claimed) ? claimed : claimed ? [claimed] : [];
      const results = [];
      for (const item of rows) {
        try {
          const proposed = item.proposed_value_json ?? {};
          const body = {
            status: 'draft',
            title: String(proposed.title ?? item.title ?? '').trim(),
            slug: `draft-${String(item.id).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()}`,
            excerpt: String(proposed.excerpt ?? proposed.title ?? item.title ?? '').trim().slice(0, 500),
            content: renderDraftHtml({ title: proposed.title ?? item.title ?? '', sections: proposed.sections ?? [] }),
            published_at: new Date().toISOString(),
          };
          const draft = await this.createItem('articles', body);
          const linked = await this.completeClaim(item.id, draft?.id ?? draft?.data?.id ?? null);
          results.push({ status: 'draft_created', itemId: item.id, articleId: draft?.id ?? draft?.data?.id, workItem: linked });
        } catch (error) {
          await this.releaseClaim(item.id, error);
          results.push({ status: 'retryable', itemId: item.id, error: error.message });
        }
      }
      return results;
    },
  };
}
