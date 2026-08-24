import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_ITEM_STATUS,
  OUTCOMES,
  validatePatchFields,
  computeDedupeKey,
  computeBeforeHash,
  createWorkItem,
  claimWorkItem,
  buildWorkItem,
} from '../src/work-items.mjs';
import { loadConfig } from '../src/config.mjs';

const ALLOWLIST = { products: ['seo_title', 'seo_description'] };
const cfgShadow = loadConfig({});
const cfgOn = loadConfig({
  SEO_WORKER_ENABLED: 'true',
  SEO_WORKER_DRY_RUN: 'false',
});

function baseInput(overrides = {}) {
  const before = { seo_title: '', seo_description: '' };
  return {
    type: 'seo_meta',
    subtype: 'missing_seo_title',
    entity_type: 'products',
    entity_key: 'product-12345',
    entity_id: 12345,
    url: 'https://shop.test/catalog/tractors/p12345',
    title: 'Product 12345 is missing an SEO title',
    summary: 'Product 12345 has an empty seo_title field.',
    recommendation: 'Add a concise, commercial seo_title for product 12345.',
    evidence: [
      {
        claim: 'seo_title is empty for product 12345',
        tier: 'single',
        source: { type: 'crawl', url: 'https://shop.test/catalog/tractors/p12345' },
      },
    ],
    sources: [{ type: 'crawl', url: 'https://shop.test/catalog/tractors/p12345' }],
    patch: { seo_title: 'Трактор John Deere XYZ — характеристики и цена' },
    before_hash: computeBeforeHash(before),
    ...overrides,
  };
}

test('WORK_ITEM_STATUS exposes only the documented control-plane statuses', () => {
  // Worker is only ever allowed to EMIT "draft". Other statuses exist for the
  // human lifecycle (ready/review/applied/rolled_back) and worker outcomes
  // (rejected/conflict) but the worker never publishes/promotes.
  for (const s of ['draft', 'ready', 'review', 'applied', 'rolled_back', 'rejected', 'conflict']) {
    assert.ok(Object.values(WORK_ITEM_STATUS).includes(s), `missing status ${s}`);
  }
});

test('validatePatchFields splits a patch into allowed vs forbidden', () => {
  const r = validatePatchFields(ALLOWLIST, 'products', {
    seo_title: 'x',
    price: 100,
    status: 'published',
  });
  assert.deepEqual(r.allowed, ['seo_title']);
  assert.deepEqual([...r.forbidden].sort(), ['price', 'status']);
  assert.equal(r.hasForbidden, true);
});

test('validatePatchFields: unknown entity type rejects everything', () => {
  const r = validatePatchFields(ALLOWLIST, 'unknown_entity', { seo_title: 'x' });
  assert.equal(r.hasForbidden, true);
  assert.ok(r.forbidden.includes('seo_title'));
});

test('invariant 1 (shadow): disabled config writes nothing and calls no client', async () => {
  let createCalls = 0;
  const client = {
    createItem: async () => {
      createCalls += 1;
      return { id: 'w1' };
    },
  };
  const input = baseInput();
  const res = await createWorkItem({
    input,
    config: cfgShadow,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [],
    client,
  });
  assert.equal(res.action, OUTCOMES.SHADOW);
  assert.equal(res.written, false);
  assert.equal(createCalls, 0);
});

test('invariant 4 (evidence): recommendation without evidence is rejected', async () => {
  const input = baseInput({ evidence: [] });
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [],
  });
  assert.equal(res.action, OUTCOMES.REJECTED);
  assert.equal(res.written, false);
  assert.ok(res.reason.toLowerCase().includes('evidence') || /evidence/i.test(res.errors.join(' ')));
});

test('invariant 3 (allowlist): a forbidden field is rejected loudly, never silently', async () => {
  const input = baseInput({ patch: { price: 100, status: 'published' } });
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [],
  });
  assert.equal(res.action, OUTCOMES.REJECTED);
  assert.equal(res.written, false);
  assert.ok(res.forbidden.includes('price'));
  assert.ok(res.forbidden.includes('status'));
});

test('invariant 3 (allowlist): forbidden field list is reported even alongside allowed fields', async () => {
  const input = baseInput({ patch: { seo_title: 'ok', slug: 'evil' } });
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [],
  });
  assert.equal(res.action, OUTCOMES.REJECTED);
  assert.deepEqual(res.forbidden, ['slug']);
});

test('invariant 5 (stale hash): mismatched before_hash => conflict, nothing applied', async () => {
  let createCalls = 0;
  const client = { createItem: async () => { createCalls += 1; return { id: 'w1' }; } };
  const input = baseInput();
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: 'some-other-hash',
    allowlist: ALLOWLIST,
    existingItems: [],
    client,
  });
  assert.equal(res.action, OUTCOMES.CONFLICT);
  assert.equal(res.written, false);
  assert.equal(res.reason, 'stale_hash');
  assert.equal(createCalls, 0);
});

test('invariant 6 (dedupe): an identical active recommendation is skipped, no new item', async () => {
  let createCalls = 0;
  const client = { createItem: async () => { createCalls += 1; return { id: 'w-new' }; } };
  const input = baseInput();
  const existing = { id: 'w-old', dedupe_key: computeDedupeKey(input), status: WORK_ITEM_STATUS.DRAFT };
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [existing],
    client,
  });
  assert.equal(res.action, OUTCOMES.SKIPPED);
  assert.equal(res.written, false);
  assert.equal(res.existing.id, 'w-old');
  assert.equal(createCalls, 0);
});

test('dedupe respects status: a rolled_back or rejected prior item does NOT block a fresh one', async () => {
  for (const status of [WORK_ITEM_STATUS.ROLLED_BACK, WORK_ITEM_STATUS.REJECTED]) {
    const input = baseInput();
    const existing = { id: 'w-old', dedupe_key: computeDedupeKey(input), status };
    const res = await createWorkItem({
      input,
      config: cfgOn,
      currentHash: input.before_hash,
      allowlist: ALLOWLIST,
      existingItems: [existing],
    });
    assert.equal(res.action, OUTCOMES.CREATED, `status ${status} should allow recreation`);
  }
});

test('happy path: a valid recommendation creates a DRAFT-only work item (invariant 2)', async () => {
  const input = baseInput();
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [],
  });
  assert.equal(res.action, OUTCOMES.CREATED);
  assert.equal(res.written, true);
  assert.equal(res.workItem.status, WORK_ITEM_STATUS.DRAFT);
  assert.equal(res.workItem.dedupe_key, computeDedupeKey(input));
  assert.equal(res.workItem.before_hash, input.before_hash);
  assert.equal(res.workItem.entity_type, 'products');
  assert.equal(res.workItem.type, 'seo_meta');
  // The proposed patch is stored verbatim (allowed fields only) for human review.
  assert.deepEqual(res.workItem.patch_json, { seo_title: input.patch.seo_title });
});

test('createWorkItem persists through the provided client when a real write is allowed', async () => {
  const created = [];
  const client = {
    createItem: async (collection, body) => {
      created.push({ collection, body });
      return { id: 'w-1', ...body };
    },
  };
  const input = baseInput();
  const res = await createWorkItem({
    input,
    config: cfgOn,
    currentHash: input.before_hash,
    allowlist: ALLOWLIST,
    existingItems: [],
    client,
  });
  assert.equal(res.action, OUTCOMES.CREATED);
  assert.equal(created.length, 1);
  assert.equal(created[0].collection, 'seo_work_items');
  assert.equal(created[0].body.status, WORK_ITEM_STATUS.DRAFT);
  assert.equal(res.workItem.id, 'w-1');
});

test('buildWorkItem never produces a non-draft status, regardless of input.status', () => {
  const input = baseInput({ status: 'published' });
  const item = buildWorkItem({ input, allowlist: ALLOWLIST, runId: 'r1' });
  assert.equal(item.status, WORK_ITEM_STATUS.DRAFT);
});

test('dedupe key is deterministic and independent of patch key ordering', () => {
  const a = baseInput({ patch: { seo_title: 'x', seo_description: 'y' } });
  const b = baseInput({ patch: { seo_description: 'y', seo_title: 'x' } });
  assert.equal(computeDedupeKey(a), computeDedupeKey(b));
});

test('dedupe key differs when the recommendation differs', () => {
  const a = baseInput();
  const b = baseInput({ patch: { seo_title: 'different value' } });
  assert.notEqual(computeDedupeKey(a), computeDedupeKey(b));
});

test('dedupe key differs when the entity differs', () => {
  const a = baseInput();
  const b = baseInput({ entity_key: 'product-99999', entity_id: 99999 });
  assert.notEqual(computeDedupeKey(a), computeDedupeKey(b));
});

test('computeBeforeHash is stable for equal objects and ignores key order', () => {
  assert.equal(
    computeBeforeHash({ seo_title: '', seo_description: '' }),
    computeBeforeHash({ seo_description: '', seo_title: '' }),
  );
});

test('claimWorkItem sets claim fields with ttl and refuses to steal an active claim', async () => {
  let updated = null;
  const client = {
    getItem: async () => ({ id: 'w1', worker_run_id: null, claimed_at: null, expires_at: null }),
    updateItem: async (_c, _id, body) => { updated = body; return { id: 'w1', ...body }; },
  };
  const res = await claimWorkItem({
    workItem: { id: 'w1' },
    config: cfgOn,
    client,
    runId: 'run-A',
    ttlMs: 60_000,
  });
  assert.equal(res.action, 'claimed');
  assert.equal(updated.worker_run_id, 'run-A');
  assert.equal(typeof updated.claimed_at, 'string');
  assert.equal(typeof updated.expires_at, 'string');
});

test('claimWorkItem refuses to steal a non-expired claim held by another run', async () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const client = {
    getItem: async () => ({ id: 'w1', worker_run_id: 'run-other', claimed_at: future, expires_at: future }),
    updateItem: async () => { throw new Error('should not update'); },
  };
  const res = await claimWorkItem({
    workItem: { id: 'w1' },
    config: cfgOn,
    client,
    runId: 'run-A',
    ttlMs: 60_000,
  });
  assert.equal(res.action, 'busy');
});

test('claimWorkItem allows re-claiming once a previous claim has expired', async () => {
  const past = new Date(Date.now() - 1_000).toISOString();
  let updated = null;
  const client = {
    getItem: async () => ({ id: 'w1', worker_run_id: 'run-other', claimed_at: past, expires_at: past }),
    updateItem: async (_c, _id, body) => { updated = body; return { id: 'w1', ...body }; },
  };
  const res = await claimWorkItem({
    workItem: { id: 'w1' },
    config: cfgOn,
    client,
    runId: 'run-A',
    ttlMs: 60_000,
  });
  assert.equal(res.action, 'claimed');
  assert.equal(updated.worker_run_id, 'run-A');
});

test('claimWorkItem is a no-op when shadow (writes nothing)', async () => {
  let updated = null;
  const client = {
    getItem: async () => ({ id: 'w1' }),
    updateItem: async (_c, _id, body) => { updated = body; return { id: 'w1', ...body }; },
  };
  const res = await claimWorkItem({
    workItem: { id: 'w1' },
    config: cfgShadow,
    client,
    runId: 'run-A',
    ttlMs: 60_000,
  });
  assert.equal(res.action, OUTCOMES.SHADOW);
  assert.equal(updated, null);
});
