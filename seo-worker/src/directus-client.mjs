// seo-worker/src/directus-client.mjs
//
// Minimal Directus REST client. The worker talks to Directus only through this
// client, and the client reads its token/URL from config (which comes from env
// at runtime). No token or URL is ever hardcoded in this package.
//
// The client is dependency-free (uses the global `fetch` available in Node 20+)
// and accepts an injected `fetchImpl` so callers/tests can substitute a fake
// transport without touching the network.

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
 *   getFactoryInputs: (options?: {limit?: number}) => Promise<any>,
 *   upsertFactoryWorkItem: (body: object) => Promise<any>,
 *   claimApproved: (limit?: number) => Promise<any>,
 *   createClaimedDraft: (body: object) => Promise<any>,
 *   releaseClaim: (id: string, error: unknown) => Promise<any>,
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
  const workerRunId = String(config.runId ?? '').trim().slice(0, 128);

  async function request(method, path, body, extraHeaders = {}) {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...extraHeaders,
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

  function factoryRequest(path, body, { includeRunId = true } = {}) {
    if (includeRunId && !workerRunId) {
      throw new Error('directus-client: config.runId is required for SEO Factory mutations');
    }
    const headers = includeRunId ? { 'x-seo-worker-run': workerRunId } : {};
    return request('POST', path, body, headers);
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
    getFactoryInputs({ limit = 100 } = {}) {
      return factoryRequest('/seo-factory/inputs', { limit }, { includeRunId: false });
    },
    upsertFactoryWorkItem(item) {
      return factoryRequest('/seo-factory/work-items/upsert', item);
    },
    claimApproved(limit = 10) {
      return factoryRequest('/seo-factory/claim', { limit });
    },
    createClaimedDraft(body) {
      return factoryRequest('/seo-factory/draft', body);
    },
    releaseClaim(id, error) {
      return factoryRequest('/seo-factory/release', { id, error: String(error?.message ?? error ?? 'unknown') });
    },
    async processApprovedDrafts({ limit = 10 } = {}) {
      const claimed = await this.claimApproved(limit);
      const rows = Array.isArray(claimed) ? claimed : claimed ? [claimed] : [];
      const results = [];
      for (const item of rows) {
        try {
          const proposed = item.proposed_value_json ?? {};
          const body = {
            id: item.id,
            title: String(proposed.title ?? item.title ?? '').trim(),
            excerpt: String(proposed.excerpt ?? proposed.title ?? item.title ?? '').trim().slice(0, 500),
            sections: Array.isArray(proposed.sections) ? proposed.sections : [],
          };
          const linked = await this.createClaimedDraft(body);
          results.push({ status: 'draft_created', itemId: item.id, articleId: linked?.article, workItem: linked });
        } catch (error) {
          await this.releaseClaim(item.id, error);
          results.push({ status: 'retryable', itemId: item.id, error: error.message });
        }
      }
      return results;
    },
  };
}
