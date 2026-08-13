// seo-worker/src/config.mjs
//
// Safe configuration for the SEO content-factory worker.
//
// Invariants enforced here (and proven by test/config.test.mjs):
//   1. disabled/shadow by default — the worker writes nothing unless it is BOTH
//      explicitly enabled (SEO_WORKER_ENABLED=true) AND taken out of dry-run
//      (SEO_WORKER_DRY_RUN=false). See ADR-003 + spec principle 5.
//
// The worker talks to Directus only through an HTTP client reading tokens from env
// at runtime. No token is ever hardcoded in this package.

/**
 * Fields that the worker is allowed to PROPOSE changes to, per entity collection.
 *
 * Per ADR-003 these are SEO / editorial text fields only. Commercial, identity,
 * media, relation and lifecycle fields are owned by other systems and MUST NOT be
 * touched by the worker even in draft form.
 */
export const DEFAULT_ALLOWED_FIELDS = Object.freeze({
  articles: [
    'title',
    'seo_title',
    'seo_description',
    'seo_summary',
    'content_blocks', // structured Flexible-Editor JSON (draft only)
  ],
  categories: ['seo_title', 'seo_description', 'short_description'],
  products: ['seo_title', 'seo_description', 'short_description'],
  pages: ['seo_title', 'seo_description', 'short_description'],
  home_page: ['seo_title', 'seo_description'],
});

/**
 * High-risk fields that must be rejected loudly (never silently) if they ever
 * appear in a worker proposal. This is the negative counterpart of the allowlist
 * and is enforced independently so that an allowlist typo cannot silently open a
 * protected field.
 */
export const FORBIDDEN_FIELDS = Object.freeze([
  // commercial / lifecycle
  'price',
  'price_status',
  'availability_status',
  'delivery_status',
  'status',
  'verified_at',
  'source_name',
  'source_url',
  // identity
  'id',
  'slug',
  'sku',
  'sku_normalized',
  'mpn',
  'mpn_normalized',
  // classification / relations
  'category',
  'related_products',
  // media / files
  'main_image',
  'gallery',
  // catalog payload
  'specifications',
  'documents',
  'is_featured',
  'show_on_homepage',
  'sort_order',
]);

const ENABLE_FLAG = 'SEO_WORKER_ENABLED';
const DRY_RUN_FLAG = 'SEO_WORKER_DRY_RUN';
const URL_FLAG = 'DIRECTUS_URL';
const TOKEN_FLAG = 'SEO_WORKER_TOKEN';
const RUN_ID_FLAG = 'SEO_WORKER_RUN_ID';
const MIN_TIER_FLAG = 'SEO_WORKER_MIN_EVIDENCE_TIER';

const KNOWN_TIERS = ['authoritative', 'corroborated', 'single', 'weak'];

function generateRunId() {
  // Stable enough for a single process; not a security primitive.
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Load worker configuration from an environment map.
 *
 * Pure function: pass an env object (defaults to process.env) so tests are
 * deterministic and never touch the real environment.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {Readonly<ReturnType<buildConfig>>}
 */
export function loadConfig(env = process.env) {
  return buildConfig(env);
}

function buildConfig(env) {
  const enabled = env[ENABLE_FLAG] === 'true';
  const dryRun = env[DRY_RUN_FLAG] !== 'false'; // safe default: dry-run ON
  const directusUrl = env[URL_FLAG] ? String(env[URL_FLAG]).trim() || null : null;
  const directusToken = env[TOKEN_FLAG] ? String(env[TOKEN_FLAG]) : null;

  const requestedTier = env[MIN_TIER_FLAG] ? String(env[MIN_TIER_FLAG]) : 'single';
  const minEvidenceTier = KNOWN_TIERS.includes(requestedTier) ? requestedTier : 'single';

  const runId = env[RUN_ID_FLAG] ? String(env[RUN_ID_FLAG]) : generateRunId();

  return Object.freeze({
    enabled,
    dryRun,
    directusUrl,
    directusToken,
    tokenSource: directusToken ? `env:${TOKEN_FLAG}` : null,
    runId,
    minEvidenceTier,
    allowedFields: DEFAULT_ALLOWED_FIELDS,
    forbiddenFields: FORBIDDEN_FIELDS,
  });
}

/**
 * The worker is in "shadow" mode (writes nothing) whenever it is disabled OR in
 * dry-run mode. Both gates must be opened to perform a real write.
 *
 * @param {{enabled: boolean, dryRun: boolean}} config
 * @returns {boolean}
 */
export function isShadow(config) {
  return !config.enabled || config.dryRun;
}
