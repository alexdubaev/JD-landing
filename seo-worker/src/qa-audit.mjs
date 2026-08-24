// Read-only product QA audit. This module deliberately accepts only a page
// reader (or a getItems adapter) and never imports or calls write operations.

export const PRODUCT_FIELDS = Object.freeze([
  'id',
  'slug',
  'url',
  'category.slug',
  'seo_title',
  'seo_description',
  'main_image',
  'image_alt',
  'full_description',
  'short_description',
  'related_products',
]);

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DESCRIPTION_MIN_LENGTH = 70;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normaliseTitle(value) {
  return nonEmptyString(value) ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : null;
}

function productUrl(product, baseUrl = '') {
  if (nonEmptyString(product.url)) return product.url.trim();
  const categorySlug = product.category?.slug || product.category_slug;
  const slug = product.slug || product.id;
  const path = categorySlug ? `/catalog/${categorySlug}/${slug}` : `/catalog/${slug}`;
  return `${String(baseUrl).replace(/\/+$/, '')}${path}`;
}

function task(product, baseUrl, reason, subtype, currentValues, priority) {
  return { url: productUrl(product, baseUrl), reason, subtype, currentValues, priority };
}

function hasImage(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

function hasRelatedProducts(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function leadingServiceJunk(value) {
  return nonEmptyString(value) && /^\/[A-Za-z]{2,}\b/.test(value.trim());
}

function repeatedDeereShop(value) {
  return nonEmptyString(value) && /—\s*DEERE-SHOP\s*—\s*DEERE-SHOP/i.test(value);
}

function localTasks(product, baseUrl, minDescriptionLength) {
  const tasks = [];
  const title = product.seo_title;
  const description = product.seo_description;

  if (!nonEmptyString(title)) {
    tasks.push(task(product, baseUrl, 'seo_title', 'missing', { seo_title: title ?? null }, 'high'));
  }
  if (repeatedDeereShop(title)) {
    tasks.push(task(product, baseUrl, 'seo_title', 'repeated_brand', { seo_title: title }, 'medium'));
  }
  if (!nonEmptyString(description)) {
    tasks.push(task(product, baseUrl, 'seo_description', 'missing', { seo_description: description ?? null }, 'high'));
  } else {
    if (leadingServiceJunk(description)) {
      tasks.push(task(product, baseUrl, 'seo_description', 'leading_service_junk', { seo_description: description }, 'high'));
    }
    if (description.trim().length < minDescriptionLength) {
      tasks.push(task(product, baseUrl, 'seo_description', 'too_short', { seo_description: description }, 'medium'));
    }
  }
  if (!hasImage(product.main_image)) {
    tasks.push(task(product, baseUrl, 'image', 'missing', { main_image: product.main_image ?? null }, 'medium'));
  }
  if (!nonEmptyString(product.image_alt)) {
    tasks.push(task(product, baseUrl, 'image_alt', 'missing', { image_alt: product.image_alt ?? null }, 'medium'));
  }
  if (!nonEmptyString(product.full_description)) {
    tasks.push(task(product, baseUrl, 'full_description', 'missing', { full_description: product.full_description ?? null }, 'medium'));
  }
  if (!nonEmptyString(product.short_description)) {
    tasks.push(task(product, baseUrl, 'short_description', 'missing', { short_description: product.short_description ?? null }, 'medium'));
  }
  if (!hasRelatedProducts(product.related_products)) {
    tasks.push(task(product, baseUrl, 'related_products', 'empty', { related_products: product.related_products ?? null }, 'low'));
  }
  return tasks;
}

function normalisePage(response) {
  if (Array.isArray(response)) return { items: response, nextCursor: undefined };
  const items = response?.items ?? response?.data ?? [];
  return { items: Array.isArray(items) ? items : [], nextCursor: response?.nextCursor };
}

/**
 * Adapt the existing Directus client to the audit's read-only page-reader
 * contract. Only getItems is required or invoked.
 */
export function createDirectusProductPageReader(client) {
  if (!client || typeof client.getItems !== 'function') {
    throw new Error('qa-audit: client.getItems is required for read-only product paging');
  }
  return async ({ page, pageSize }) => ({
    items: await client.getItems('products', {
      fields: PRODUCT_FIELDS.join(','),
      limit: pageSize,
      offset: page * pageSize,
      sort: 'id',
    }),
  });
}

/**
 * Scan products in batches without mutating Directus or the supplied products.
 * A pageReader may use cursor pagination (`nextCursor`) or offset/page
 * pagination (an omitted cursor); `limit` caps products, not tasks.
 */
export async function auditProducts({
  pageReader,
  limit = Infinity,
  pageSize = DEFAULT_PAGE_SIZE,
  baseUrl = '',
  minDescriptionLength = DEFAULT_DESCRIPTION_MIN_LENGTH,
} = {}) {
  if (typeof pageReader !== 'function') throw new Error('qa-audit: pageReader is required');
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('qa-audit: pageSize must be a positive integer');
  if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 0))) {
    throw new Error('qa-audit: limit must be a non-negative integer');
  }

  const products = [];
  let page = 0;
  let cursor;
  let cursorMode = false;
  while (products.length < limit) {
    const response = normalisePage(await pageReader({ cursor, page, pageSize }));
    const remaining = limit - products.length;
    products.push(...response.items.slice(0, remaining));
    if (products.length >= limit || response.items.length === 0) break;

    if (response.nextCursor !== undefined) {
      cursorMode = true;
      if (response.nextCursor === null || response.nextCursor === '') break;
      cursor = response.nextCursor;
    } else if (cursorMode || response.items.length < pageSize) {
      break;
    } else {
      page += 1;
    }
  }

  const titleCounts = new Map();
  for (const product of products) {
    const title = normaliseTitle(product.seo_title);
    if (title) titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  }

  const tasks = [];
  for (const product of products) {
    const title = normaliseTitle(product.seo_title);
    if (title && titleCounts.get(title) > 1) {
      tasks.push(task(product, baseUrl, 'seo_title', 'duplicate', { seo_title: product.seo_title }, 'high'));
    }
    tasks.push(...localTasks(product, baseUrl, minDescriptionLength));
  }

  return { scanned: products.length, tasks };
}
