// seo-worker/src/content-drafts.mjs
//
// Draft-only article creation and the idempotent work-item -> article relation.
//
// Worker invariants enforced here (and proven by test/content-drafts.test.mjs):
//   2. draft-only -> the worker only ever creates status="draft" articles. There
//      is NO publish / promote / approve / release method in this module, by
//      design. Publication is a human action (Publisher/Admin). The module's
//      exported names are asserted to contain none of those verbs.
//   3. field allowlist -> forbidden article fields are rejected.
//   7. idempotent retry -> linking a work item to an article is re-read before
//      every attempt, so a transient error can never create a duplicate relation
//      and a write that partially succeeded is detected on retry.
//
// The worker talks to Directus only through the injected `client` (built from
// env tokens at runtime, see directus-client.mjs). No token is hardcoded here.

import { isShadow } from './config.mjs';
import { OUTCOMES } from './work-items.mjs';

export const ARTICLE_COLLECTION = 'articles';
export const SEO_WORK_ITEMS_COLLECTION = 'seo_work_items';
export const ARTICLE_DRAFT_STATUS = 'draft';

/**
 * Article statuses the worker is forbidden from creating. Any attempt to submit
 * one of these as the article status is rejected as "non_draft_status".
 */
export const PUBLISH_FORBIDDEN_STATUSES = Object.freeze([
  'published',
  'ready',
  'review',
]);

function isRetriable(error) {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  return (
    msg.includes('transient') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('response lost') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504')
  );
}

function filterAllowed(allowlist, fields) {
  const allowed = new Set(allowlist.articles || []);
  const accepted = {};
  const forbidden = [];
  for (const key of Object.keys(fields || {})) {
    if (allowed.has(key)) {
      accepted[key] = fields[key];
    } else {
      forbidden.push(key);
    }
  }
  return { accepted, forbidden };
}

/**
 * Create a draft article. Invariants:
 *   - shadow config writes nothing;
 *   - a non-draft requested status is rejected;
 *   - forbidden fields are rejected;
 *   - title is required (the worker never invents a hardcoded slug/title);
 *   - the persisted status is always "draft".
 *
 * @param {{
 *   input: {title?: string, status?: string, [k: string]: unknown},
 *   config: {enabled: boolean, dryRun: boolean},
 *   client: {createItem: (collection: string, body: object) => Promise<object>},
 *   allowlist: {articles: string[]}
 * }} args
 */
export async function createArticleDraft({ input, config, client, allowlist }) {
  // Invariant 1: disabled/shadow by default writes nothing.
  if (isShadow(config)) {
    return { action: OUTCOMES.SHADOW, written: false };
  }

  // Invariant 2: the worker must never create a published/ready article. The
  // worker always forces status="draft" itself, so `status` is validated here
  // and then excluded from the allowlist field bag.
  const requestedStatus = input.status != null ? String(input.status) : ARTICLE_DRAFT_STATUS;
  if (requestedStatus !== ARTICLE_DRAFT_STATUS) {
    return { action: OUTCOMES.REJECTED, written: false, reason: 'non_draft_status' };
  }

  // The worker must not invent content; a human-authored title is required.
  const title = input.title ? String(input.title).trim() : '';
  if (title === '') {
    return { action: OUTCOMES.REJECTED, written: false, reason: 'missing_title' };
  }

  // Invariant 3: field allowlist for articles. `status` is worker-controlled,
  // not part of the editable patch, so it is removed before filtering.
  const fields = { ...input };
  delete fields.status;
  const { accepted, forbidden } = filterAllowed(allowlist, fields);
  if (forbidden.length > 0) {
    return {
      action: OUTCOMES.REJECTED,
      written: false,
      reason: 'forbidden_field',
      forbidden,
    };
  }

  const body = { ...accepted, status: ARTICLE_DRAFT_STATUS };
  const created = await client.createItem(ARTICLE_COLLECTION, body);
  return { action: 'created', written: true, draft: { id: created.id, ...created } };
}

/**
 * Idempotently link a seo_work_item to an article (sets `article` M2O field).
 *
 * Algorithm (per attempt, up to `retries`):
 *   1. re-read the work item;
 *   2. if already linked to the target article -> "already_linked" (no write);
 *   3. if linked to a different article -> "conflict" (no write);
 *   4. otherwise PATCH { article: articleId };
 *      - on a retriable error, loop back to step 1 (re-read detects a write
 *        that partially succeeded, so no duplicate relation is ever created).
 *
 * @param {{
 *   workItemId: string,
 *   articleId: string,
 *   config: {enabled: boolean, dryRun: boolean},
 *   client: {getItem: (c:string,id:string)=>Promise<any>, updateItem: (c:string,id:string,b:object)=>Promise<any>},
 *   retries?: number
 * }} args
 */
export async function linkWorkItemToArticle({
  workItemId,
  articleId,
  config,
  client,
  retries = 3,
}) {
  if (isShadow(config)) {
    return { action: OUTCOMES.SHADOW, written: false };
  }

  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const current = await client.getItem(SEO_WORK_ITEMS_COLLECTION, workItemId);
    const linkedTo = current && current.article ? current.article : null;

    if (linkedTo === articleId) {
      return { action: 'already_linked', written: false };
    }
    if (linkedTo !== null && linkedTo !== undefined) {
      return { action: 'conflict', written: false, existing: linkedTo };
    }

    try {
      await client.updateItem(SEO_WORK_ITEMS_COLLECTION, workItemId, { article: articleId });
      return { action: 'linked', written: true };
    } catch (error) {
      lastError = error;
      if (!isRetriable(error) || attempt === retries - 1) {
        return { action: 'error', written: false, error: String(error.message || error) };
      }
      // retriable: loop, which re-reads first -> idempotent.
    }
  }

  return {
    action: 'error',
    written: false,
    error: lastError ? String(lastError.message || lastError) : 'exhausted retries',
  };
}
