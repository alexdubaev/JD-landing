# SEO Factory Core Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SEO Factory worker safe on Directus 12 Core by giving its token endpoint-only capabilities and no direct collection permissions.

**Architecture:** The `seo-factory` Directus extension becomes the complete server-side capability boundary: it reads limited published inputs, validates and upserts work items, leases approved rows, creates escaped draft articles, and releases failed claims. The worker calls only these routes. The SEO Worker role retains no collection permissions, so Core's lack of custom permission rules cannot broaden its access.

**Tech Stack:** Node.js 20+, Directus 12.1.1 custom endpoint, Knex database context, PostgreSQL 17, Docker Compose, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-24-seo-factory-core-endpoint-design.md`

## Global Constraints

- No Directus Core custom `permissions`, `validation`, or `presets` rules for the SEO Worker role.
- Worker role has zero direct collection permissions and no Studio access.
- Only the extension may access SEO inputs, queue rows, or articles for a worker request; each route checks `SEO_FACTORY_WORKER_ROLE_ID`.
- Published catalogue/pages and published articles are read-only in all worker flows; created articles always have `status: "draft"`.
- Escape all title and section HTML before the draft insert; never publish or apply catalogue fields.
- All worker network calls use `AbortSignal.timeout`; no scheduler overlap.
- No secrets in source, logs, test fixtures, commit messages, or documentation.
- Production deployment stays profile-disabled with every SEO Factory flag false until persistent staging evidence and separate owner approval.

---

### Task 1: Convert the SEO Worker role to endpoint-only Core access

**Files:**
- Modify: `directus/access/blueprint.mjs`
- Modify: `directus/access/blueprint.test.mjs`

**Interfaces:** Produces `accessBlueprint.policies.find(({ key }) => key === "seo_worker")` with `permissions: []` and `appAccess: false`. The existing access apply routine removes stale managed-policy rules.

- [ ] **Step 1: Write the failing access test**

```js
test("SEO Worker has endpoint-only Core access", () => {
  const policy = accessBlueprint.policies.find(({ key }) => key === "seo_worker");
  assert.ok(policy);
  assert.equal(policy.appAccess, false);
  assert.equal(policy.adminAccess, false);
  assert.deepEqual(policy.permissions, []);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test access/blueprint.test.mjs`

Expected: FAIL because Release B still grants collection access.

- [ ] **Step 3: Write minimal implementation**

Delete the SEO Worker's direct products/categories/pages/queue/articles grants. Preserve role and policy names, `existingNames`, icon, and no-Studio settings.

- [ ] **Step 4: Run GREEN**

Run: `node --test access/blueprint.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add directus/access/blueprint.mjs directus/access/blueprint.test.mjs
git commit -m "security: make SEO Worker endpoint-only"
```

### Task 2: Add Core-safe published-input and queue endpoints

**Files:**
- Modify: `directus/extensions/directus-extension-seo-factory/src/index.js`
- Modify: `directus/extensions/directus-extension-seo-factory/dist/index.js`
- Modify: `directus/extensions/seo-factory.test.mjs`
- Create: `directus/extensions/seo-factory-core-endpoint.test.mjs`

**Interfaces:** Export `readPublishedInputs({ database, accountability, request })` for `POST /inputs` and `upsertShadowWorkItem({ database, accountability, request })` for `POST /work-items/upsert`. Both require the configured worker role and accept only limits 1–100.

- [ ] **Step 1: Write failing tests**

```js
test("inputs returns only limited published source fields", async () => {
  const rows = await readPublishedInputs({ database: fakeDatabase, accountability: worker, request: { body: { limit: 1 } } });
  assert.deepEqual(Object.keys(rows.products[0]).sort(), ["id", "seo_description", "seo_title", "slug", "status", "title"]);
  assert.equal(rows.products[0].status, "published");
});

test("queue endpoint forces ready and writes only seo_work_items", async () => {
  const result = await upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body: recommendation } });
  assert.equal(result.status, "ready");
  assert.deepEqual(fakeDatabase.writes.map(({ table }) => table), ["seo_work_items"]);
});

test("endpoint rejects a non-worker role", async () => {
  await assert.rejects(() => readPublishedInputs({ database: fakeDatabase, accountability: { role: "other" }, request: { body: {} } }), /not authorized/u);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test extensions/seo-factory-core-endpoint.test.mjs`

Expected: FAIL because the exported endpoint functions do not exist.

- [ ] **Step 3: Implement the bounded operations**

Add pure helpers for role checking, bounded limits, field/string caps and an allowlisted recommendation shape. Query each of `products`, `categories`, and `pages` with `status = "published"`, selecting only `id,status,slug,title,seo_title,seo_description`. For upsert require a non-empty `dedupe_key`, allow only known entity types, force `status: "ready"`, and update or insert only `seo_work_items`.

- [ ] **Step 4: Register POST routes and mirror dist**

```js
router.post("/inputs", handler((ctx, request) => readPublishedInputs({ ...ctx, request }), context));
router.post("/work-items/upsert", handler((ctx, request) => upsertShadowWorkItem({ ...ctx, request }), context));
```

Do not add generic collection or unauthenticated routes. Copy the tested source to `dist/index.js`.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test extensions/seo-factory.test.mjs extensions/seo-factory-core-endpoint.test.mjs`

```bash
git add directus/extensions/directus-extension-seo-factory directus/extensions/seo-factory.test.mjs directus/extensions/seo-factory-core-endpoint.test.mjs
git commit -m "feat: expose Core-safe SEO factory inputs and queue"
```

### Task 3: Keep draft creation and retry ownership inside the endpoint

**Files:**
- Modify: `directus/extensions/directus-extension-seo-factory/src/index.js`
- Modify: `directus/extensions/directus-extension-seo-factory/dist/index.js`
- Modify: `directus/extensions/seo-factory-core-endpoint.test.mjs`

**Interfaces:** Export `createClaimedDraft({ database, accountability, request })` for `POST /draft`. Change `releaseClaim` to require the caller's bounded `x-seo-worker-run` header. No worker request may choose an article status.

- [ ] **Step 1: Write failing tests**

```js
test("draft endpoint creates an escaped draft and completes its own claim", async () => {
  const result = await createClaimedDraft({ database: fakeDatabase, accountability: worker, request: claimedRequest("run-a", "<img onerror=1>") });
  assert.equal(result.status, "draft_created");
  assert.equal(fakeDatabase.articleWrites[0].status, "draft");
  assert.match(fakeDatabase.articleWrites[0].content, /&lt;img onerror=1&gt;/u);
});

test("draft and release reject a claim owned by another run", async () => {
  await assert.rejects(() => createClaimedDraft({ database: fakeDatabase, accountability: worker, request: claimedRequest("run-b") }), /claim not owned/u);
  await assert.rejects(() => releaseClaim({ database: fakeDatabase, accountability: worker, request: releaseRequest("run-b") }), /claim not owned/u);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test extensions/seo-factory-core-endpoint.test.mjs`

Expected: FAIL because article creation is currently performed by the worker and claim ownership is unchecked.

- [ ] **Step 3: Implement one draft transaction**

Lock the requested queue row. Require `status === "processing"` and `worker_run_id === runId`. Escape every text fragment, insert an `articles` row with exactly `status: "draft"`, then set that queue row to `draft_created` and finish its lease record in the same transaction. On failure preserve a claim that only the same run can release to `retryable`.

- [ ] **Step 4: Register `/draft`, validate source/dist, then GREEN**

Run: `node --check extensions/directus-extension-seo-factory/src/index.js && node --check extensions/directus-extension-seo-factory/dist/index.js && node --test extensions/seo-factory.test.mjs extensions/seo-factory-core-endpoint.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add directus/extensions/directus-extension-seo-factory directus/extensions/seo-factory-core-endpoint.test.mjs
git commit -m "security: keep SEO drafts inside endpoint boundary"
```

### Task 4: Restrict worker transport to the endpoint

**Files:**
- Modify: `seo-worker/src/config.mjs`
- Modify: `seo-worker/src/directus-client.mjs`
- Modify: `seo-worker/src/worker.mjs`
- Modify: `seo-worker/src/daemon.mjs`
- Modify: `seo-worker/test/factory.test.mjs`
- Create: `seo-worker/test/core-endpoint-client.test.mjs`

**Interfaces:** `createSeoFactoryConfig()` produces a bounded run id. The client exposes `getFactoryInputs`, `upsertFactoryWorkItem`, `claimApproved`, `createClaimedDraft`, and `releaseClaim`. `runShadowBatch()` uses no `/items/*` request.

- [ ] **Step 1: Write failing transport tests**

```js
test("shadow batch uses factory input and queue routes only", async () => {
  await runShadowBatch({ client, config: enabledConfig });
  assert.deepEqual(client.calls, ["POST /seo-factory/inputs", "POST /seo-factory/work-items/upsert"]);
});

test("approved draft creation never posts an article to /items", async () => {
  await client.processApprovedDrafts({ limit: 1 });
  assert.ok(client.calls.includes("POST /seo-factory/draft"));
  assert.ok(client.calls.every((path) => !path.startsWith("POST /items/")));
});
```

- [ ] **Step 2: Run RED**

Run: `node --test test/core-endpoint-client.test.mjs test/factory.test.mjs`

Expected: FAIL because the worker directly calls `/items/*`.

- [ ] **Step 3: Implement endpoint-only client calls**

Use `POST /seo-factory/inputs` and `POST /seo-factory/work-items/upsert` for shadow planning. Send `x-seo-worker-run` for upsert, claim, draft and release. Replace direct article creation and `/complete` with `POST /seo-factory/draft`. Preserve legacy client methods only where existing non-factory tests require them, plus all timeout/disabled/no-overlap invariants.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test && npm run build && npm run dry-run`

```bash
git add seo-worker/src/config.mjs seo-worker/src/directus-client.mjs seo-worker/src/worker.mjs seo-worker/src/daemon.mjs seo-worker/test/factory.test.mjs seo-worker/test/core-endpoint-client.test.mjs
git commit -m "feat: route SEO worker through Core-safe endpoint"
```

### Task 5: Prove Core compatibility and document safe rollout

**Files:**
- Modify: `docs/runbooks/seo-factory-release-b.md`
- Create: `docs/runbooks/seo-factory-release-b1-core-checklist.md`
- Modify: `deploy/seo-factory.test.mjs` only if a test fixture needs a Core assertion.

**Interfaces:** Runbooks require an empty SEO Worker policy, endpoint installation, a root-owned token file, and an endpoint-only staging run.

- [ ] **Step 1: Write a failing runbook assertion if a test fixture exists**

```js
test("Core runbook forbids direct worker collection permissions", async () => {
  assert.doesNotMatch(runbook, /read published .*products|create\/update articles/u);
  assert.match(runbook, /no direct collection permissions/u);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test seo-factory.test.mjs`

Expected: FAIL if the old direct-permission instructions remain.

- [ ] **Step 3: Update the runbooks**

Document: backup; schema and existing claim migration; empty role/policy; token provision; extension installation; bounded endpoint-only batch; byte-for-byte unchanged published rows. State no Directus Core custom permission rules and no production enable in this release.

- [ ] **Step 4: Perform a disposable Core staging proof**

Start fresh Directus 12.1.1/PostgreSQL 17 containers on an unused loopback port. Apply schema/access/migration; install extension; create the no-permission worker role/token; seed one published and one draft source row; exercise inputs, upsert, claim, draft and release; confirm direct collection endpoints deny the token; remove only those exact disposable containers, network and generated token afterwards.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test seo-factory.test.mjs`

```bash
git add docs/runbooks/seo-factory-release-b.md docs/runbooks/seo-factory-release-b1-core-checklist.md deploy/seo-factory.test.mjs
git commit -m "docs: document Core-safe SEO Factory rollout"
```

### Task 6: Full gate, scope review, merge, and disabled deploy

**Files:** Verify only; do not change files except an explicitly necessary documentation correction.

- [ ] **Step 1: Run release gates**

```powershell
cd seo-worker; npm test; npm run build; npm run dry-run
cd ..\directus; npm run schema:check; node --test access/blueprint.test.mjs extensions/seo-factory.test.mjs extensions/seo-factory-core-endpoint.test.mjs migrations/seo-factory-shadow.test.mjs
cd ..\deploy; node --test caddyfile.test.mjs deploy.test.mjs backup.test.mjs seo-factory.test.mjs
cd ..\frontend; npm run typecheck; npm run lint; npm test; npm run build; npm audit --omit=dev --audit-level=high
```

- [ ] **Step 2: Verify scope and secrets**

```powershell
git diff --name-only agent/production-infrastructure...HEAD
git diff --check agent/production-infrastructure...HEAD
rg -n --hidden -g '!node_modules/**' '(Bearer\s+[A-Za-z0-9._-]{20,}|BEGIN (RSA|OPENSSH|PRIVATE))' seo-worker directus deploy docs
```

Expected: only spec-allowed paths; no real credentials; no unrelated storefront, catalogue, lead, user, file, dependency, Caddy, or production environment changes.

- [ ] **Step 3: Merge and deploy disabled only after review**

Merge one reviewed commit into `agent/production-infrastructure`, push, create a production backup, and deploy normally without the `seo-factory` profile. Verify `/`, `/catalog`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, Directus health, and that normal `docker compose config --services` omits `seo-worker`. Confirm all four SEO Factory flags are false or absent. Do not apply the Core endpoint role, token, migration, or staging data to production in this task.
