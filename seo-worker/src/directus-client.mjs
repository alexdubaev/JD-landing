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
 * }}
 */
export function createDirectusClient(config, { fetchImpl } = {}) {
  const fetchFn = fetchImpl || fetch;

  if (!config || !config.directusUrl) {
    throw new Error('directus-client: config.directusUrl is required (from DIRECTUS_URL env)');
  }
  // A token MUST be supplied at runtime. We deliberately do NOT fall back to any
  // hardcoded value: an absent token is a hard failure, never a silent public
  // (unauthenticated) write.
  if (!config.directusToken) {
    throw new Error(
      'directus-client: config.directusToken is required (from SEO_WORKER_TOKEN env); no fallback token exists',
    );
  }

  const base = config.directusUrl.replace(/\/+$/, '');

  async function request(method, path, body) {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const headers = {
      Authorization: `Bearer ${config.directusToken}`,
      Accept: 'application/json',
    };
    const init = { method, headers };
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
  };
}
