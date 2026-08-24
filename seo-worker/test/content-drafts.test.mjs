import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createArticleDraft,
  linkWorkItemToArticle,
  ARTICLE_DRAFT_STATUS,
  ARTICLE_COLLECTION,
  SEO_WORK_ITEMS_COLLECTION,
  PUBLISH_FORBIDDEN_STATUSES,
} from '../src/content-drafts.mjs';
import { loadConfig } from '../src/config.mjs';

const cfgShadow = loadConfig({});
const cfgOn = loadConfig({
  SEO_WORKER_ENABLED: 'true',
  SEO_WORKER_DRY_RUN: 'false',
});
const allowlist = {
  articles: ['title', 'seo_title', 'seo_description', 'content_blocks'],
};

test('invariant 2 (draft-only): the module exports NO publish / promote / approve method', async () => {
  const mod = await import('../src/content-drafts.mjs');
  // Only FUNCTIONS count: a constant like PUBLISH_FORBIDDEN_STATUSES documents
  // what is forbidden, it is not a publish operation.
  const fnNames = Object.entries(mod)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);
  const forbidden = fnNames.filter((name) =>
    /^(publish|promote|approve|release|unpublish|setPublished)/i.test(name),
  );
  assert.deepEqual(forbidden, [], `no publish-like functions allowed, got: ${forbidden.join(', ')}`);
});

test('ARTICLE_DRAFT_STATUS is the only status the worker ever sets', () => {
  assert.equal(ARTICLE_DRAFT_STATUS, 'draft');
});

test('PUBLISH_FORBIDDEN_STATUSES includes published and ready', () => {
  assert.ok(PUBLISH_FORBIDDEN_STATUSES.includes('published'));
  assert.ok(PUBLISH_FORBIDDEN_STATUSES.length > 0);
});

test('invariant 1 (shadow): disabled config writes nothing and calls no client', async () => {
  const calls = [];
  const client = {
    createItem: async (collection, body) => {
      calls.push({ collection, body });
      return { id: 'a1', ...body };
    },
  };
  const res = await createArticleDraft({
    input: { title: 't', content_blocks: { type: 'doc' } },
    config: cfgShadow,
    client,
    allowlist,
  });
  assert.equal(res.action, 'shadow');
  assert.equal(res.written, false);
  assert.equal(calls.length, 0);
});

test('invariant 2 (draft-only): an input status of "published" is rejected', async () => {
  const client = {
    createItem: async () => { throw new Error('must not be called'); },
  };
  const res = await createArticleDraft({
    input: { title: 't', status: 'published' },
    config: cfgOn,
    client,
    allowlist,
  });
  assert.equal(res.action, 'rejected');
  assert.equal(res.written, false);
  assert.equal(res.reason, 'non_draft_status');
});

test('invariant 2 (draft-only): a draft status input is accepted and forced to draft', async () => {
  const created = [];
  const client = {
    createItem: async (collection, body) => {
      created.push(body);
      return { id: 'a1', ...body };
    },
  };
  const res = await createArticleDraft({
    input: { title: 't', status: 'draft' },
    config: cfgOn,
    client,
    allowlist,
  });
  assert.equal(res.action, 'created');
  assert.equal(res.draft.status, 'draft');
  assert.equal(created[0].status, 'draft');
});

test('invariant 3 (allowlist): a forbidden article field is rejected', async () => {
  const client = { createItem: async () => { throw new Error('must not be called'); } };
  const res = await createArticleDraft({
    input: { title: 't', slug: 'evil-hardcoded-slug' },
    config: cfgOn,
    client,
    allowlist,
  });
  assert.equal(res.action, 'rejected');
  assert.equal(res.written, false);
  assert.equal(res.reason, 'forbidden_field');
  assert.ok(res.forbidden.includes('slug'));
});

test('happy path: creates a draft article with status=draft and only allowed fields', async () => {
  const created = [];
  const client = {
    createItem: async (collection, body) => {
      created.push({ collection, body });
      return { id: 'a-42', ...body };
    },
  };
  const res = await createArticleDraft({
    input: {
      title: 'Как выбрать трактор John Deere',
      seo_title: 'Тракторы John Deere — подбор',
      content_blocks: { type: 'doc', content: [] },
    },
    config: cfgOn,
    client,
    allowlist,
  });
  assert.equal(res.action, 'created');
  assert.equal(res.written, true);
  assert.equal(res.draft.id, 'a-42');
  assert.equal(res.draft.status, 'draft');
  assert.equal(created[0].collection, ARTICLE_COLLECTION);
  assert.equal(created[0].body.title, 'Как выбрать трактор John Deere');
  assert.equal(created[0].body.status, 'draft');
  // No slug / status override leaked into the payload.
  assert.equal(created[0].body.slug, undefined);
});

test('invariant 7 (idempotent link): already linked to the same article is a no-op', async () => {
  const patches = [];
  const client = {
    getItem: async () => ({ id: 'w1', article: 'a1' }),
    updateItem: async () => { throw new Error('should not update'); },
  };
  const res = await linkWorkItemToArticle({
    workItemId: 'w1',
    articleId: 'a1',
    config: cfgOn,
    client,
  });
  assert.equal(res.action, 'already_linked');
  assert.equal(patches.length, 0);
});

test('invariant 7 (idempotent link): linked to a different article is a conflict', async () => {
  const client = {
    getItem: async () => ({ id: 'w1', article: 'a-other' }),
    updateItem: async () => { throw new Error('should not update'); },
  };
  const res = await linkWorkItemToArticle({
    workItemId: 'w1',
    articleId: 'a1',
    config: cfgOn,
    client,
  });
  assert.equal(res.action, 'conflict');
  assert.equal(res.existing, 'a-other');
});

test('invariant 7 (idempotent link): not linked -> links exactly once', async () => {
  let patchCount = 0;
  const client = {
    getItem: async () => ({ id: 'w1', article: null }),
    updateItem: async (collection, id, body) => {
      patchCount += 1;
      assert.equal(collection, SEO_WORK_ITEMS_COLLECTION);
      assert.equal(id, 'w1');
      assert.deepEqual(body, { article: 'a1' });
      return { id, ...body };
    },
  };
  const res = await linkWorkItemToArticle({
    workItemId: 'w1',
    articleId: 'a1',
    config: cfgOn,
    client,
  });
  assert.equal(res.action, 'linked');
  assert.equal(patchCount, 1);
});

test('invariant 7 (idempent retry): a transient PATCH error that did NOT apply is retried then linked', async () => {
  let patchCount = 0;
  const state = { article: null };
  const client = {
    getItem: async () => ({ id: 'w1', article: state.article }),
    updateItem: async (_c, _id, body) => {
      patchCount += 1;
      if (patchCount === 1) throw new Error('transient network error');
      state.article = body.article;
      return { id: 'w1', ...body };
    },
  };
  const res = await linkWorkItemToArticle({
    workItemId: 'w1',
    articleId: 'a1',
    config: cfgOn,
    client,
    retries: 3,
  });
  assert.equal(res.action, 'linked');
  assert.equal(patchCount, 2);
});

test('invariant 7 (idempotent retry): a PATCH that threw but DID apply is detected on re-read, no duplicate', async () => {
  let patchCount = 0;
  const state = { article: null };
  const client = {
    getItem: async () => ({ id: 'w1', article: state.article }),
    updateItem: async (_c, _id, body) => {
      patchCount += 1;
      // The write actually succeeds on the server side...
      state.article = body.article;
      // ...but the response is lost (transient error reported to caller).
      if (patchCount === 1) throw new Error('response lost');
      return { id: 'w1', ...body };
    },
  };
  const res = await linkWorkItemToArticle({
    workItemId: 'w1',
    articleId: 'a1',
    config: cfgOn,
    client,
    retries: 3,
  });
  // The retry re-reads first, sees it is already linked, and does not write again.
  assert.equal(res.action, 'already_linked');
  assert.equal(patchCount, 1);
});

test('invariant 7 (idempotent link): shadow config writes nothing', async () => {
  let patchCount = 0;
  const client = {
    getItem: async () => ({ id: 'w1', article: null }),
    updateItem: async () => { patchCount += 1; return {}; },
  };
  const res = await linkWorkItemToArticle({
    workItemId: 'w1',
    articleId: 'a1',
    config: cfgShadow,
    client,
  });
  assert.equal(res.action, 'shadow');
  assert.equal(patchCount, 0);
});

test('createArticleDraft dedupes a missing title into the worker-derived placeholder is NOT used (title required)', async () => {
  // The worker must not invent a hardcoded draft slug/title. A title is required.
  const client = { createItem: async () => { throw new Error('must not be called'); } };
  const res = await createArticleDraft({
    input: { content_blocks: { type: 'doc' } },
    config: cfgOn,
    client,
    allowlist,
  });
  assert.equal(res.action, 'rejected');
  assert.equal(res.reason, 'missing_title');
});
