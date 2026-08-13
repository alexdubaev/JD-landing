import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadConfig,
  isShadow,
  DEFAULT_ALLOWED_FIELDS,
  FORBIDDEN_FIELDS,
} from '../src/config.mjs';

test('invariant 1 (disabled/shadow): no env flag => not enabled, shadow mode', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.enabled, false);
  assert.equal(isShadow(cfg), true);
});

test('enabled only when SEO_WORKER_ENABLED is exactly "true"', () => {
  assert.equal(loadConfig({ SEO_WORKER_ENABLED: 'true' }).enabled, true);
  // Anything else must NOT enable the worker.
  assert.equal(loadConfig({ SEO_WORKER_ENABLED: '1' }).enabled, false);
  assert.equal(loadConfig({ SEO_WORKER_ENABLED: 'TRUE' }).enabled, false);
  assert.equal(loadConfig({ SEO_WORKER_ENABLED: 'yes' }).enabled, false);
  assert.equal(loadConfig({ SEO_WORKER_ENABLED: '' }).enabled, false);
});

test('dry-run defaults ON even when enabled => still shadow (writes nothing)', () => {
  const cfg = loadConfig({ SEO_WORKER_ENABLED: 'true' });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.dryRun, true);
  assert.equal(isShadow(cfg), true);
});

test('worker may write only when enabled AND dry-run explicitly OFF', () => {
  const cfg = loadConfig({
    SEO_WORKER_ENABLED: 'true',
    SEO_WORKER_DRY_RUN: 'false',
  });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.dryRun, false);
  assert.equal(isShadow(cfg), false);
});

test('isShadow is true whenever disabled, regardless of dry-run', () => {
  const cfg = loadConfig({ SEO_WORKER_ENABLED: 'true', SEO_WORKER_DRY_RUN: 'false' });
  assert.equal(isShadow(cfg), false);
  const disabled = loadConfig({ SEO_WORKER_DRY_RUN: 'false' });
  assert.equal(isShadow(disabled), true);
});

test('Directus URL and token are read from env at runtime, never hardcoded', () => {
  const cfg = loadConfig({
    DIRECTUS_URL: 'https://directus.example.test',
    SEO_WORKER_TOKEN: 'runtime-token-xyz',
  });
  assert.equal(cfg.directusUrl, 'https://directus.example.test');
  assert.equal(cfg.directusToken, 'runtime-token-xyz');
});

test('no token / no url by default (empty env)', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.directusToken, null);
  assert.equal(cfg.directusUrl, null);
});

test('token source string is documented as env-derived (not a literal secret)', () => {
  const cfg = loadConfig({ SEO_WORKER_TOKEN: 'abc' });
  assert.equal(cfg.tokenSource, 'env:SEO_WORKER_TOKEN');
  const cfg2 = loadConfig({});
  assert.equal(cfg2.tokenSource, null);
});

test('runId is a stable non-empty string', () => {
  const cfg = loadConfig({ SEO_WORKER_ENABLED: 'true' });
  assert.equal(typeof cfg.runId, 'string');
  assert.ok(cfg.runId.length > 0);
  const cfgWithRun = loadConfig({ SEO_WORKER_RUN_ID: 'run-42' });
  assert.equal(cfgWithRun.runId, 'run-42');
});

test('default allowed fields contain only safe SEO/editorial fields', () => {
  const productFields = DEFAULT_ALLOWED_FIELDS.products;
  assert.ok(productFields.includes('seo_title'));
  assert.ok(productFields.includes('seo_description'));

  // Editorial/product fields that must NEVER be worker-owned.
  const mustNot = [
    'price', 'price_status', 'availability_status', 'delivery_status',
    'status', 'slug', 'mpn', 'sku', 'category', 'main_image', 'gallery',
    'specifications', 'documents', 'is_featured',
  ];
  for (const f of mustNot) {
    assert.ok(!productFields.includes(f), `products allowlist must not include "${f}"`);
  }
});

test('FORBIDDEN_FIELDS is a non-empty set of high-risk fields', () => {
  assert.ok(Array.isArray(FORBIDDEN_FIELDS));
  assert.ok(FORBIDDEN_FIELDS.length > 0);
  for (const critical of ['price', 'status', 'slug', 'mpn', 'category']) {
    assert.ok(FORBIDDEN_FIELDS.includes(critical), `FORBIDDEN_FIELDS must include "${critical}"`);
  }
});

test('returned config is frozen (immutable)', () => {
  const cfg = loadConfig({ SEO_WORKER_ENABLED: 'true' });
  assert.ok(Object.isFrozen(cfg));
});

test('min evidence tier default is a known tier', () => {
  const cfg = loadConfig({});
  assert.equal(typeof cfg.minEvidenceTier, 'string');
  assert.ok(['authoritative', 'corroborated', 'single', 'weak'].includes(cfg.minEvidenceTier));
});
