# Deere-Shop Directus Admin Reversible Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить согласованную Directus-админку Deere-Shop на Directus 12.1.1 с relation-rich статьями, безопасными каталоговыми миграциями, специализированным importer, SEO control plane, draft workflow и доказуемым rollback каждого релиза.

**Architecture:** Directus Studio остаётся control plane; изменения выпускаются additive и по одному типу данных. Каждый source-of-truth cutover проходит backup, dry-run, dual-read, reconciliation и отдельное подтверждение. Собственный код ограничивается importer/reconciliation, индексированным поиском, content worker и небольшими frontend/Directus adapters.

**Tech Stack:** Directus 12.1.1, PostgreSQL 17, Node.js 22 в контейнере, Next.js 16.2.12, React 19.2.8, TypeScript 5.9.3, Vitest 3.2.7, Node test runner.

## Global Constraints

- Production содержит 12 971 товар; все опубликованы и входят в scope.
- 283 товара имеют legacy gallery; 1 251 file reference должны быть учтены; ожидаются 968 дополнительных `product_images` при отдельном `main_image`.
- Directus не обновляется до 12.2 в рамках editor pilot. Любой upgrade — отдельный staging spike и отдельный production release proposal.
- При действующем Core limit decommission шести legacy collections выполняется до создания новых junction и `seo_work_items`.
- Не удалять `lead_forms`, `contact_channels`, `seo_redirects`, `product_images`, `product_specifications`, `product_documents`, `order_items`.
- Не создавать `articles_products` и `articles_categories`: embedded article relations канонически хранятся в article M2A.
- Не создавать warehouse/supplier/multiple-price collections без утверждённого feed contract.
- Не менять Docker, Caddy, VPS, env, tokens, authentication, roles или permissions, пока конкретная задача ниже не получила отдельное явное разрешение владельца.
- Не использовать `git add -A`. Перед каждым commit проверять `git diff --name-only` против allowed files задачи и индексировать только перечисленные пути.
- Не выполнять push или deployment без отдельного явного разрешения.
- Одна задача ниже — один reviewed commit/release. Нельзя объединять соседние задачи ради удобства.
- Source of truth и importer field ownership определены [ADR-003](../../decisions/ADR-003-field-level-source-of-truth.md).
- Целевая модель определена [дизайн-спецификацией](../specs/2026-08-13-directus-admin-reversible-architecture-design.md).

## Обязательный release packet

Каждый data/schema/security релиз должен сохранить в закрытом release artifact directory:

```text
release.json
git-head.txt
schema-before.json
schema-after.json
counts-before.json
counts-after.json
relations-before.json
relations-after.json
plan.json
before-state.ndjson
apply-report.ndjson
reconciliation.json
rollback-plan.json
route-checks.json
```

`release.json` содержит release ID, UTC time, operator, target environment, git SHA,
allowed files/collections/fields, backup filenames и approval reference. Артефакты с
PII, токенами, товарами или внутренними ценами не коммитятся.

Если задача не объявляет более узкий список `Protected areas`, для неё действуют все
Global Constraints: любой не перечисленный файл, field, collection, route, secret,
role, permission и infrastructure surface является read-only.

Во всех командах ниже `$env:JD_RELEASE_DIR` указывает на заранее созданную закрытую
абсолютную директорию release packet, `$env:JD_BASELINE_BEFORE` и
`$env:JD_BASELINE_AFTER` — на конкретные baseline JSON, а `$env:JD_REVIEWED_BASE` — на
проверенный базовый commit SHA. Скрипты обязаны отказать, если переменная отсутствует,
путь относительный или директория находится внутри repository.

Перед destructive/data release оператор запускает установленную production-копию
`/opt/jd-landing/release/deploy/backup.sh`, проверяет dump через `pg_restore --list`,
архив файлов через `tar -tzf` и копирует backup вне VPS. Restore rehearsal выполняется
на disposable PostgreSQL/Directus instance той же версии до production apply.

---

### Task 1: Recoverability и release artifact tooling

**Release:** R1, tooling only; production data не изменяются.

**Files:**
- Create: `directus/releases/lib/artifacts.mjs`
- Create: `directus/releases/lib/artifacts.test.mjs`
- Create: `directus/releases/capture-baseline.mjs`
- Create: `directus/releases/capture-baseline.test.mjs`
- Create: `directus/releases/compare-baseline.mjs`
- Create: `directus/releases/compare-baseline.test.mjs`
- Modify: `directus/import/verify-products.sql`
- Modify: `directus/package.json`
- Create: `docs/runbooks/directus-reversible-release.md`

**Allowed Directus access:** read-only collections, fields, relations, flows, presets,
permissions metadata, counts и hashes. Запись в Directus запрещена.

**Protected areas:** все production rows, schema, Files, roles/policies, `deploy/`, env,
frontend и чужие untracked-файлы.

**Interfaces:**
- Produces `captureBaseline(client, options): Baseline`.
- Produces `compareBaseline(before, after, invariants): ReconciliationResult`.
- CLI принимает `--output=$env:JD_RELEASE_DIR` и отказывается писать в repository,
  если output содержит product/PII artifacts.
- Baseline фиксирует 12 971/12 971 products, 283 gallery products, 1 251 references,
  18 categories, 3 articles, 2 pages, 13 sections, 12 FAQ, 4 leads и collection count.

- [ ] **Step 1: Написать failing tests для deterministic artifacts**

Проверить сортировку JSON keys/rows, отсутствие token/PII, отказ от существующего
release ID, invariant failures и redaction `leads` до одного count.

- [ ] **Step 2: Запустить tests и подтвердить failure**

Run: `cd directus; node --test releases/lib/artifacts.test.mjs releases/capture-baseline.test.mjs releases/compare-baseline.test.mjs`

Expected: FAIL, потому что модули ещё не существуют.

- [ ] **Step 3: Реализовать минимальный read-only collector и comparator**

Collector запрашивает только перечисленные fields, вычисляет ordered SHA-256 и не
включает значения leads/orders. Comparator возвращает `ok: false` при потере товара,
неожиданной депубликации, изменении категории вне release scope или broken relation.

- [ ] **Step 4: Добавить package scripts и runbook**

Добавить `release:baseline` и `release:compare`. Runbook должен содержать backup,
off-server copy, `pg_restore --list`, disposable restore, exact artifact checklist и
правило stop-on-diff.

- [ ] **Step 5: Verification**

Run: `cd directus; npm test`

Run: `git diff --check`

Routes: только read-only baseline `/`, `/catalog`, один category/product/article URL из
baseline manifest, `/about`, `/delivery`, `/contacts`, `/parts-request`.

**Rollback:** удалить только tooling commit; production state не менялся.

---

### Task 2: Native Studio UX без source-of-truth cutover

**Release:** R2, Directus metadata only.

**Files:**
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/apply-studio.mjs`
- Modify: `directus/schema/apply-studio.test.mjs`
- Create: `directus/studio/workspace-blueprint.mjs`
- Create: `directus/studio/workspace-blueprint.test.mjs`
- Create: `directus/studio/apply-workspace.mjs`
- Create: `directus/studio/apply-workspace.test.mjs`
- Modify: `directus/package.json`

**Allowed metadata:** labels, notes, groups, field widths, display templates, list
columns, collection order, bookmarks/presets и native Insights panels. Формы: Главная,
Страница, Товар, Категория, Статья, FAQ, Заявка, Заказ, Настройки сайта.

**Explicit exclusions:** не менять project/user language, users, roles, permissions,
field types, required/nullability, rows или current legacy interfaces
`gallery/specifications/documents` до dual-read migration.

**Interfaces:** `applyStudioBlueprint(..., { includeLocaleChanges: false })` не меняет
`/settings` и `/users`. `applyWorkspace` управляет только presets/panels с project-owned
stable keys.

- [ ] **Step 1: Зафиксировать tests scope isolation**

Tests должны доказать отсутствие PATCH `/settings`, `/users`, `/roles`, `/permissions`
и data endpoints в default mode.

- [ ] **Step 2: Настроить формы и рабочее меню**

Скрытые technical collections остаются доступными inline. Dashboard показывает
реальные counts и контрольные списки, не декоративные графики.

- [ ] **Step 3: Dry-run metadata diff**

Run: `cd directus; node schema/apply-studio.mjs --dry-run`

Run: `cd directus; node studio/apply-workspace.mjs --dry-run`

Expected: только declared metadata actions.

- [ ] **Step 4: QA на staging**

Проверить Studio при 1366×768 и 1920×1080: списки показывают title/SKU/category display,
формы не требуют знания UUID/JSON/junction. Сохранение не выполнять в UX smoke test.

- [ ] **Step 5: Regression verification**

Run: `cd directus; npm test`

Routes: `/`, `/catalog`, baseline category/product/article, `/about`, `/delivery`,
`/contacts`, `/parts-request`. Expected: byte/visual-equivalent content.

**Rollback:** импортировать metadata snapshot R1; rows и schema не затрагивались.

---

### Task 3: Flexible Editor 1.9.0 disposable pilot на Directus 12.1.1

**Release:** S1, disposable/staging only; production installation запрещена.

**Files:**
- Create: `docs/reports/directus-flexible-editor-1.9.0-pilot.md`
- Create: `directus/spikes/flexible-editor/article-fixtures.json`
- Create: `directus/spikes/flexible-editor/verify-pilot.mjs`
- Create: `directus/spikes/flexible-editor/verify-pilot.test.mjs`

**Allowed staging schema:** nullable `articles.content_blocks`, alias
`articles.editor_nodes`, `articles_editor_nodes` junction. Создавать на fresh disposable
instance либо restored DB после удаления legacy collections; production не трогать.

**Protected areas:** production, Directus version, existing `articles.content`, roles,
Docker/Caddy/env в repository.

**Pilot contract:**

```text
rich text → product relation → rich text → CTA relation → category relation → table → rich text
```

JSON не содержит snapshot title/price/slug/URL. Rich-text-only fixture не создаёт
relation rows. H1 отключён; H2/H3/H4, lists, quote, links, tables, undo/redo включены.

- [ ] **Step 1: Pin и проверить artifact**

Скачать exact npm artifact `directus-extension-flexible-editor@1.9.0` во временную
директорию, записать SHA-256, license и package host в pilot report; не менять repo
dependencies.

- [ ] **Step 2: Создать staging fixtures и automated verifier**

Verifier проверяет JSON/M2A sync, orphan rows, relation target existence, duplicate,
copy/paste, drag/drop, delete node, delete draft и uninstall/restart.

- [ ] **Step 3: Проверить CTA без нового storage collection**

Pass только если target остаётся relation, а label/variant являются presentation data.
Если это невозможно, report обязан выбрать ровно один fallback:
`article_cta_blocks(id,label,variant,target_type,target_product,target_category,target_article,target_page,external_url,anchor,analytics_key)`.

- [ ] **Step 4: Security и renderer corpus**

Проверить scripts, event handlers, `javascript:`/`data:` URL, malformed tables,
unknown nodes и permission-denied relation. Raw HTML execution запрещено.

- [ ] **Step 5: Gate decision**

Report имеет итог `ACCEPT`, `ACCEPT_WITH_ARTICLE_CTA_BLOCKS` или `REJECT` с заполненными
schema footprint, uninstall result, UX, API payload и rollback evidence.

**Verification routes:** staging article preview fixtures и обычная published article
страница. Production routes не меняются.

**Rollback:** уничтожить disposable instance либо восстановить staging snapshot.

---

### Task 4: Directus Labs SEO Plugin 1.1.1 compatibility spike

**Release:** S2, отдельный fresh disposable/staging instance без Flexible Editor.

**Files:**
- Create: `docs/reports/directus-labs-seo-plugin-1.1.1-pilot.md`
- Create: `directus/spikes/seo-plugin/verify-pilot.mjs`
- Create: `directus/spikes/seo-plugin/verify-pilot.test.mjs`

**Allowed staging fields:** один disposable SEO JSON field на копиях home/page/category/
product/article; scalar SEO fields read-only baseline. Production/package files не
меняются.

- [ ] **Step 1: Зафиксировать exact artifact, host mismatch и hash**
- [ ] **Step 2: Снять schema/API snapshot до установки**
- [ ] **Step 3: Проверить startup, form, list display, file picker, API output, export/import и русско-английский UX**
- [ ] **Step 4: Выполнить uninstall и сравнить schema/API с baseline**
- [ ] **Step 5: Записать решение `ACCEPT` или `REJECT`**

Reject обязателен при потере scalar fallback, неудаляемом schema footprint,
преимущественно английском техническом UX или необходимости переписать editor.

**Verification routes:** staging metadata для `/`, category, product, article и info
page. Проверяются title, description, canonical, robots, OG и JSON output.

**Rollback:** uninstall и restore disposable snapshot; production не менялся.

---

### Task 5: Safe decommission шести legacy collections

**Release:** R3, destructive schema release; выполняется до всех новых collections.

**Files:**
- Create: `directus/migrations/decommission-legacy-collections.mjs`
- Create: `directus/migrations/decommission-legacy-collections.test.mjs`
- Create: `directus/migrations/reconcile-legacy-decommission.mjs`
- Create: `directus/migrations/reconcile-legacy-decommission.test.mjs`
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Modify: `directus/schema/platform-compatibility.test.mjs`
- Modify: `directus/package.json`

**Allowed collections only:** `hero_blocks`, `advantages`, `cta_blocks`,
`seo_text_blocks`, `banners`, `testimonials`.

**Preconditions:** DB/files backup, off-server copy, successful restore rehearsal,
zero rows, zero FK/Directus relations/flows/hooks/presets/permissions/runtime references,
reviewed dry-run.

- [ ] **Step 1: Tests должны останавливать delete при любой зависимости или row**
- [ ] **Step 2: Реализовать `--dry-run`, `--apply --release-id=...` и reconciliation**
- [ ] **Step 3: Получить owner approval на immutable plan artifact**
- [ ] **Step 4: Выполнить один production decommission release**
- [ ] **Step 5: Подтвердить 25 → 19 physical collections**

Run before: `cd directus; node migrations/decommission-legacy-collections.mjs --dry-run --output=$env:JD_RELEASE_DIR`

Run after: `cd directus; node migrations/reconcile-legacy-decommission.mjs --baseline=$env:JD_BASELINE_BEFORE --actual=$env:JD_BASELINE_AFTER`

**Verification routes:** `/`, `/catalog`, baseline category/product/article, `/about`,
`/delivery`, `/contacts`, `/parts-request`; leads/orders smoke. Все counts R1, кроме
collection count, неизменны.

**Rollback:** остановить Directus writes, восстановить DB dump и uploads archive,
запустить Directus 12.1.1, повторить baseline/relation/route comparison. Простое
повторное создание пустых таблиц не считается rollback.

---

### Task 6: Owner-XOR migration для `page_sections`

**Release:** R4, отдельная schema+data migration.

**Files:**
- Create: `directus/migrations/migrate-page-section-owners.mjs`
- Create: `directus/migrations/migrate-page-section-owners.test.mjs`
- Create: `directus/migrations/sql/page-section-owner-xor-up.sql`
- Create: `directus/migrations/sql/page-section-owner-xor-down.sql`
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Modify: `directus/package.json`

**Allowed data:** только 13 rows `page_sections`, поля `page` и `home_page`.

**Rule:** 11 rows с `home_page` становятся home-owned и получают `page=null`; две
остальные сохраняют `page` и `home_page=null`. После apply действует DB CHECK «ровно
один owner»; `page` nullable.

- [ ] **Step 1: Написать tests dual-owner, ownerless, unexpected count и rollback**
- [ ] **Step 2: Создать dry-run owner table и before-state NDJSON**
- [ ] **Step 3: Применить row patches, nullable schema и CHECK в одной maintenance window**
- [ ] **Step 4: Reconcile 13 total / 11 home / 2 page / 0 invalid**

**Verification routes:** `/`, `/about`, `/delivery`, `/contacts`, `/parts-request`.
Проверить порядок и visibility всех 13 sections.

**Rollback:** выполнить down SQL, восстановить оба поля из before-state, вернуть
required metadata, повторить route QA.

---

### Task 7: Production article editor schema и pinned extension

**Release:** R5A; только если Task 3 = `ACCEPT` или `ACCEPT_WITH_ARTICLE_CTA_BLOCKS`.

**Files:**
- Create: `directus/migrations/setup-article-editor.mjs`
- Create: `directus/migrations/setup-article-editor.test.mjs`
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Modify: `directus/schema/platform-compatibility.test.mjs`
- Modify: `directus/package.json`
- Create only after artifact approval: `directus/extensions/directus-extension-flexible-editor/package.json`
- Create only after artifact approval: `directus/extensions/directus-extension-flexible-editor/dist/index.js`

**Allowed schema:** `articles.content_blocks`, `articles.editor_nodes`,
`articles_editor_nodes`. Conditional fallback `article_cta_blocks` разрешён только если
pilot выбрал соответствующий итог. `articles.content` не меняется.

- [ ] **Step 1: Tests для exact M2A relation metadata и collection budget ≤25**
- [ ] **Step 2: Dry-run schema diff и extension startup/uninstall rehearsal на restored staging**
- [ ] **Step 3: Production additive schema release без content migration**
- [ ] **Step 4: Reconcile zero content_blocks/junction rows и unchanged three articles**

**Verification routes:** все три production article URLs продолжают читать HTML path.

**Rollback:** отключить Flexible interface и использовать raw JSON fallback. Пустые
additive fields/junction удаляются только отдельным approved cleanup; HTML остаётся
каноном.

---

### Task 8: Article structured frontend dual-read renderer

**Release:** R5B, frontend-only scoped integration.

**Files:**
- Create: `frontend/src/components/articles/ArticleContent.tsx`
- Create: `frontend/src/components/articles/ArticleContent.test.tsx`
- Create: `frontend/src/lib/articles/structured-content.ts`
- Create: `frontend/src/lib/articles/structured-content.test.ts`
- Modify: `frontend/src/lib/directus/articles.ts`
- Modify: `frontend/src/lib/directus/articles.test.ts`
- Modify: `frontend/src/types/catalog.ts`
- Modify: `frontend/src/app/articles/[slug]/page.tsx`
- Modify: `frontend/src/app/articles/[slug]/page.test.tsx`
- Modify: `frontend/src/app/globals.css`

**Behavior:** valid non-empty `content_blocks` → structured renderer; absent/invalid
JSON → sanitized `content`. Product/category nodes resolve current relation data with
bounded fields/deep/limit. Unknown nodes render a safe diagnostic placeholder in
preview and nothing executable in public mode.

**Protected areas:** catalog product pages, metadata resolver, sitemap, security headers,
packages/dependencies и Directus schema.

- [ ] **Step 1: Failing tests для rich text, H2-H4, table, relation nodes, unsafe URLs и fallback**
- [ ] **Step 2: Реализовать dependency-free recursive React renderer с explicit node allowlist**
- [ ] **Step 3: Расширить Directus query только необходимыми article relation fields**
- [ ] **Step 4: Проверить HTML fallback всех трёх статей**

Run: `cd frontend; npm test -- ArticleContent structured-content articles page`

Run: `cd frontend; npm run typecheck; npm run lint; npm run build`

**Verification routes:** все три article URLs; structured staging fixture; `/articles`.

**Rollback:** вернуть route к `sanitizeArticleHtml(article.content)`; CMS data не
удалять.

---

### Task 9: Controlled cutover трёх статей

**Release:** R5C, content/data migration per article.

**Files:**
- Create: `directus/migrations/migrate-article-content.mjs`
- Create: `directus/migrations/migrate-article-content.test.mjs`
- Create: `directus/migrations/reconcile-article-content.mjs`
- Create: `directus/migrations/reconcile-article-content.test.mjs`
- Modify: `directus/package.json`

**Allowed data:** `articles.content_blocks`, `articles.editor_nodes` и junction rows
только для трёх baseline article IDs. `content`, slug, status, SEO и published_at
read-only.

- [ ] **Step 1: Convert HTML to deterministic JSON draft without publishing**
- [ ] **Step 2: Dry-run and visual diff each article**
- [ ] **Step 3: Publisher approves each article independently**
- [ ] **Step 4: Apply one article at a time and verify route before next**
- [ ] **Step 5: Reconcile text, headings, links, tables, relations and metadata**

**Verification routes:** все три article URLs, `/articles`, sitemap article entries и
article metadata. HTML и structured output сравниваются до cutover каждой статьи.

**Rollback:** set `content_blocks=null` and remove only migration-owned junction rows
for the affected article; HTML immediately becomes fallback.

---

### Task 10: `product_codes` и индексированный SKU/OEM search

**Release:** R6, additive schema + backend endpoint + frontend adapter.

**Files:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Modify: `directus/schema/platform-compatibility.test.mjs`
- Create: `directus/migrations/backfill-product-search.mjs`
- Create: `directus/migrations/backfill-product-search.test.mjs`
- Create: `directus/migrations/sql/product-search-indexes-up.sql`
- Create: `directus/migrations/sql/product-search-indexes-down.sql`
- Create: `directus/extensions/deere-shop-search/package.json`
- Create: `directus/extensions/deere-shop-search/src/index.js`
- Create: `directus/extensions/deere-shop-search/test/search.test.mjs`
- Modify: `frontend/src/lib/directus/catalog.ts`
- Modify: `frontend/src/lib/directus/catalog.test.ts`
- Modify: `frontend/src/app/api/catalog/suggestions/route.ts`
- Create: `frontend/src/app/api/catalog/suggestions/route.test.ts`
- Modify: `frontend/src/types/catalog.ts`

**Allowed schema:** new `product_codes(id,product,code,normalized_code,code_type,
source_name,source_reference,is_active,created_at,updated_at)`; hidden
`products.sku_normalized` and `products.mpn_normalized`; B-tree/pattern indexes on all
normalized values; unique `(product,code_type,normalized_code,source_name)`. Existing
`sku`/`mpn` values remain unchanged.

**Endpoint contract:** normalized query length 2–64, page size ≤20, paginated IDs,
current Directus accountability, no `limit=-1`, no unrestricted item fields.

- [ ] **Step 1: Tests normalization, collision, permissions, pagination and query limit**
- [ ] **Step 2: Add schema and indexes; dry-run backfill 12 971 products**
- [ ] **Step 3: Reconcile normalized hashes without editing source SKU/MPN**
- [ ] **Step 4: Implement search endpoint and prove index use with EXPLAIN**
- [ ] **Step 5: Replace frontend full scan and run synthetic 30 000-product test**

**Verification routes:** `/api/catalog/suggestions`, `/catalog?search=...`, category
search, product routes. Test exact/prefix SKU, MPN, OEM, supplier code, punctuation and
case. p95 and memory записываются в report.

**Rollback:** frontend switches back only as emergency; new data/indexes retained for
analysis. Drop выполняется отдельным cleanup после rollback report.

---

### Task 11: Canonical product images/specifications/documents

**Release:** R7A dual-read, R7B gallery migration, R7C Studio cutover — три commits.

**Files:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Create: `directus/migrations/migrate-product-gallery.mjs`
- Create: `directus/migrations/migrate-product-gallery.test.mjs`
- Create: `directus/migrations/reconcile-product-gallery.mjs`
- Create: `directus/migrations/reconcile-product-gallery.test.mjs`
- Modify: `frontend/src/lib/directus/catalog.ts`
- Modify: `frontend/src/lib/directus/catalog.test.ts`
- Modify: `frontend/src/types/catalog.ts`
- Modify: `frontend/src/components/catalog/ProductGallery.tsx`
- Modify: `frontend/src/components/catalog/ProductGallery.test.tsx`
- Modify: `frontend/src/components/catalog/SpecTable.tsx`
- Modify: `frontend/src/components/catalog/ProductDetail.tsx`
- Modify: `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx`

**R7A behavior:** child collections first, legacy JSON fallback independently for
images/specifications/documents. Empty child list не перекрывает непустой fallback до
явного `migration_complete` criterion in query mapper.

**Allowed schema metadata:** добавить aliases `products.image_items`,
`products.specification_items`, `products.document_items`; связать их соответственно с
`product_images.product`, `product_specifications.product`,
`product_documents.product`. Existing JSON fields `gallery`, `specifications`,
`documents` не меняют type/nullability/value.

**R7B allowed data:** создать только 968 `product_images`; не менять `main_image`,
legacy `gallery`, status или Files. Each row получает migration release ID в artifact,
а не новое постоянное поле.

- [ ] **Step 1: Failing dual-read and fallback tests**
- [ ] **Step 2: Deploy frontend dual-read and verify unchanged routes**
- [ ] **Step 3: Dry-run migration: 283 products / 1 251 refs / 283 main / 968 additional**
- [ ] **Step 4: Apply in idempotent batches and reconcile duplicates/orphans/order**
- [ ] **Step 5: Switch Studio to inline O2M only after route approval**

**Verification routes:** все 283 affected product URLs автоматически проверяются по
HTTP/asset IDs; минимум 20 visual samples покрывают 1, 2, 5+ images. Общие `/catalog`
и category pages также проверяются.

**Rollback:** switch frontend to legacy fallback; delete only rows listed by release
artifact after count/hash confirmation. Legacy JSON остаётся нетронутым.

---

### Task 12: Typed one-edge `products_analogs`

**Release:** R8, additive relation model.

**Files:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Create: `directus/migrations/sql/product-analogs-constraints-up.sql`
- Create: `directus/migrations/sql/product-analogs-constraints-down.sql`
- Create: `directus/migrations/reconcile-product-analogs.mjs`
- Create: `directus/migrations/reconcile-product-analogs.test.mjs`
- Modify: `frontend/src/lib/directus/catalog.ts`
- Modify: `frontend/src/lib/directus/catalog.test.ts`
- Modify: `frontend/src/types/catalog.ts`
- Modify: `frontend/src/components/catalog/RelatedProducts.tsx`
- Create: `frontend/src/components/catalog/RelatedProducts.test.tsx`

**Allowed schema:** `products_analogs(id,product_from,product_to,relation_type,
canonical_key,source_name,note,verified_at,created_at,updated_at)` и read-only O2M aliases
на `products`. Unique `canonical_key`, no-self CHECK и FK — обязательны. Legacy
`products.related_products` остаётся и перед cutover повторно подтверждается пустым.

- [ ] **Step 1: Tests symmetric canonical key, directed supersession, duplicate and self-edge rejection**
- [ ] **Step 2: Add collection and constraints with zero rows**
- [ ] **Step 3: Implement bidirectional query mapping with direction for `superseded_by`**
- [ ] **Step 4: QA from both product endpoints**

**Verification routes:** обе стороны каждого test edge; product detail, breadcrumb,
cart и lead CTA не меняются.

**Rollback:** frontend stops reading junction; rows retained until separate cleanup.

---

### Task 13: Specialized importer/reconciliation engine

**Release:** R9, CLI/worker tooling; production apply только отдельным approved run.

**Files:**
- Create: `directus/importer/manifest.mjs`
- Create: `directus/importer/normalize.mjs`
- Create: `directus/importer/profiles.mjs`
- Create: `directus/importer/plan.mjs`
- Create: `directus/importer/apply.mjs`
- Create: `directus/importer/reconcile.mjs`
- Create: `directus/importer/rollback.mjs`
- Create: `directus/importer/cli.mjs`
- Create: `directus/importer/manifest.test.mjs`
- Create: `directus/importer/profiles.test.mjs`
- Create: `directus/importer/plan.test.mjs`
- Create: `directus/importer/apply.test.mjs`
- Create: `directus/importer/reconcile.test.mjs`
- Create: `directus/importer/rollback.test.mjs`
- Modify: `directus/import/products.mjs`
- Modify: `directus/import/products.test.mjs`
- Modify: `directus/package.json`
- Create: `docs/runbooks/catalog-import-reconciliation.md`

**Default existing-product allowlist:** `price`, `price_status`,
`availability_status`, `delivery_status`, `source_name`, `source_url`, `verified_at`.

**Profiles:** `operations-default`, `trusted-weight`, `editorial-opt-in`,
`media-opt-in`, `codes-opt-in`, `analogs-opt-in`. Любой opt-in требует отдельного
approval reference. Warehouse/supplier-offer/multiple-price profiles отсутствуют.

- [ ] **Step 1: Tests запрещают full payload PATCH и protected fields**
- [ ] **Step 2: Implement immutable input hash, normalization and per-record plan**
- [ ] **Step 3: Implement minimal PATCH, idempotency, retries, resume and before-state**
- [ ] **Step 4: Implement reconciliation and exact rollback by release ID**
- [ ] **Step 5: Disable production update path старого `products.mjs` без его удаления**
- [ ] **Step 6: Staging rehearsal create/update/skip/conflict/rollback**

**QA:** forbidden `title/category/slug/SEO/media/codes/analogs` становится conflict;
new item defaults to draft; second identical run = all skip; interrupted batch resumes;
rollback restores exact before hashes.

**Verification routes:** affected product URLs, category counts, search, cart price
snapshot behavior и lead form. Published count не меняется без отдельного approved
publish action.

**Rollback:** применить release-specific rollback artifact тем же engine, затем
сравнить before/after hashes. Старый `products.mjs` не включается автоматически и не
используется как rollback mechanism.

---

### Task 14: `seo_work_items` и content factory worker

**Release:** R10A control-plane schema; R10B worker code; service deployment вне scope.

**Files:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Modify: `directus/schema/platform-compatibility.test.mjs`
- Modify: `directus/studio/workspace-blueprint.mjs`
- Modify: `directus/studio/workspace-blueprint.test.mjs`
- Create: `seo-worker/package.json`
- Create: `seo-worker/src/config.mjs`
- Create: `seo-worker/src/evidence.mjs`
- Create: `seo-worker/src/work-items.mjs`
- Create: `seo-worker/src/directus-client.mjs`
- Create: `seo-worker/src/content-drafts.mjs`
- Create: `seo-worker/src/cli.mjs`
- Create: `seo-worker/test/config.test.mjs`
- Create: `seo-worker/test/evidence.test.mjs`
- Create: `seo-worker/test/work-items.test.mjs`
- Create: `seo-worker/test/content-drafts.test.mjs`

**Allowed reuse from `codex/seo-factory-autonomous`:** evidence tiers, claim→source,
stale hash, editable field allowlist, disabled/shadow defaults, draft-only invariant —
только после переписывания tests под текущую schema и 12 971 products.

**Allowed schema:** `seo_work_items(id,type,subtype,status,severity,priority_score,
confidence,entity_type,entity_id,entity_key,url,title,summary,recommendation,
current_value_json,proposed_value_json,patch_json,evidence_json,sources_json,
metrics_json,dedupe_key,before_hash,article,worker_run_id,claimed_at,expires_at,
applied_at,rolled_back_at,last_error,created_at,updated_at)`. Поле `article` — M2O к
`articles`; `dedupe_key` unique. High-volume crawl telemetry в коллекцию не пишется.

**Forbidden reuse:** custom module, `seo_factory.*` SQL schema, Docker/env/deploy,
scheduler, placeholder article body, hardcoded draft slug и старый collection budget.

- [ ] **Step 1: Define `seo_work_items` fields and native presets/Insights**
- [ ] **Step 2: Tests worker disabled/shadow defaults and no publish method**
- [ ] **Step 3: Implement evidence/dedupe/stale/claim gates**
- [ ] **Step 4: Create only Directus draft after approved work item**
- [ ] **Step 5: Reconcile work item→article relation and idempotent retry**

**Verification routes:** `/articles` unchanged until human publish; draft accessible
only through approved preview workflow. No product rows modified by worker.

**Rollback:** disable worker; native work items remain inspectable. Remove empty
collection only by a separate decommission release.

---

### Task 15: SEO production integration

**Release:** R11; branch selected strictly from Task 4 report.

**Files if plugin accepted:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/studio-blueprint.mjs`
- Modify: `directus/schema/studio-blueprint.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Create: `directus/migrations/migrate-seo-json.mjs`
- Create: `directus/migrations/migrate-seo-json.test.mjs`
- Create: `directus/extensions/directus-labs-seo-plugin/package.json`
- Create: `directus/extensions/directus-labs-seo-plugin/dist/index.js`
- Create: `frontend/src/lib/seo/directus-seo.ts`
- Create: `frontend/src/lib/seo/directus-seo.test.ts`
- Modify: `frontend/src/lib/directus/articles.ts`
- Modify: `frontend/src/lib/directus/articles.test.ts`
- Modify: `frontend/src/lib/directus/catalog.ts`
- Modify: `frontend/src/lib/directus/catalog.test.ts`
- Modify: `frontend/src/lib/directus/content.ts`
- Modify: `frontend/src/lib/directus/content.test.ts`
- Modify: `frontend/src/types/catalog.ts`
- Modify: `frontend/src/types/content.ts`

**Files if plugin rejected:** только shared resolver/tests и native Studio groups; plugin
artifact и SEO JSON field не создаются.

**Behavior accepted branch:** JSON-first/scalar-fallback; scalar fields read-only only
after complete reconciliation, never deleted in this task.

**Allowed data fields:** additive plugin JSON field на `home_page`, `pages`,
`categories`, `products`, `articles`; existing `seo_title`, `seo_description`,
`canonical_url`, OG/indexability fields разрешены только для read/mapping и не
очищаются.

- [ ] **Step 1: Implement shared resolver with corrupted/empty JSON fallback tests**
- [ ] **Step 2: Dry-run scalar→JSON mapping and metadata diff**
- [ ] **Step 3: Deploy frontend dual-read before CMS apply**
- [ ] **Step 4: Apply additive JSON/plugin and reconcile every indexable route type**

**QA routes:** `/`, `/catalog`, every category, sampled products including no image/no
price, every article, every info page, `sitemap.xml`, `robots.txt`. Diff title,
description, canonical, robots, OG, JSON-LD и sitemap inclusion.

**Rollback:** uninstall interface, frontend scalar fallback. JSON/scalars remain until
separate cleanup.

---

### Task 16: Content Versioning, secure Live Preview и item-aware revalidation

**Release:** R12A articles; R12B pages/home only after article pilot.

**Files:**
- Create: `directus/studio/versioning-blueprint.mjs`
- Create: `directus/studio/versioning-blueprint.test.mjs`
- Create: `directus/studio/apply-versioning.mjs`
- Create: `directus/studio/apply-versioning.test.mjs`
- Modify: `directus/flows/apply-revalidation-flow.mjs`
- Modify: `directus/flows/apply-revalidation-flow.test.mjs`
- Create: `frontend/src/app/api/preview/route.ts`
- Create: `frontend/src/app/api/preview/route.test.ts`
- Create: `frontend/src/app/api/preview/disable/route.ts`
- Create: `frontend/src/app/api/preview/disable/route.test.ts`
- Modify: `frontend/src/app/api/revalidate/route.ts`
- Modify: `frontend/src/app/api/revalidate/route.test.ts`
- Modify: `frontend/src/lib/directus/client.ts`
- Modify: `frontend/src/lib/directus/client.test.ts`
- Modify: article/page/home Directus queries and their tests only

**Separate explicit env/secret approval required:** server-only preview secret. Его
значение не коммитится и не помещается в URL/logs.

**Workflow:** published view read-only; edits in global draft; preview forwards
validated `version`; promote checks required fields and results in `status=published`;
revalidation payload contains collection, item ID, old/new slug and affected tags.

- [ ] **Step 1: Tests preview auth, version validation, token secrecy and open redirect rejection**
- [ ] **Step 2: Implement version-aware server-only Directus request**
- [ ] **Step 3: Implement item-aware revalidation without global catalog flush**
- [ ] **Step 4: Pilot versioning on articles and test promote/status interaction**
- [ ] **Step 5: Expand to pages/home only after signed article report**

**Verification routes:** draft and published variants of article, `/`, `/about`,
`/delivery`; invalid/expired preview; cache state before/after promote.

**Rollback:** disable Preview URL/versioning per collection, retain published main,
switch frontend to published-only queries, restore previous Flow snapshot.

---

### Task 17: Publisher/Admin policies — separate security release

**Release:** R12C; заблокирован до отдельного явного разрешения на roles/permissions.

**Files:**
- Modify: `directus/access/blueprint.mjs`
- Modify: `directus/access/blueprint.test.mjs`
- Modify: `directus/access/apply-access.mjs`
- Modify: `directus/access/apply-access.test.mjs`
- Create: `docs/runbooks/editorial-publish-permissions.md`

**Policy contract:** Author/SEO edits draft and requests review; Publisher/Admin
promotes/publishes/archives; Admin/Owner approves bulk slug/source-of-truth migrations.
Import service identity receives temporary profile-specific field permissions and no
Studio login by default.

- [ ] **Step 1: Snapshot current roles/policies/field permissions**
- [ ] **Step 2: Tests least privilege and explicit deny cases**
- [ ] **Step 3: Dry-run matrix by role×collection×action×field**
- [ ] **Step 4: Apply only after owner signs exact matrix**
- [ ] **Step 5: Browser/API QA with separate test users**

**Protected data:** lead PII visible only Sales/Admin; SEO role cannot price/delete;
Publisher cannot schema/access/settings; importer cannot editorial fields.

**Verification routes:** Directus API create/update/promote/archive requests под каждой
test identity; public article/product/page routes после разрешённой публикации; leads и
orders доступны только утверждённой Sales/Admin identity.

**Rollback:** restore complete access snapshot with emergency Admin session retained;
verify each test identity after restore.

---

### Task 18: Visual Editor staging PoC

**Release:** S3, second phase; not a blocker and never bundled with R12.

**Files:**
- Create: `docs/reports/directus-visual-editor-poc.md`
- Create: `frontend/src/lib/directus/visual-editing.ts`
- Create: `frontend/src/lib/directus/visual-editing.test.ts`
- Modify: preview-only article/page/home components and tests
- Modify only with separate exact security approval: `frontend/next.config.ts`
- Modify only with separate exact security approval: `frontend/src/test/next-config.test.ts`
- Modify only with separate exact security approval: `deploy/Caddyfile`
- Modify only with separate exact security approval: `deploy/caddyfile.test.mjs`

**Security contract:** route-scoped frame policy; no global wildcard; exact CMS origin;
preview-only cookies; `data-directus` absent in public HTML; no browser token; current
user permissions enforced; service API stays private.

- [ ] **Step 1: Capture current CSP/XFO/CORS/cookie baseline**
- [ ] **Step 2: Write failing security tests before changing headers**
- [ ] **Step 3: Implement staging-only PoC for one article and one page**
- [ ] **Step 4: Test draft relation blocks, save, revalidation and permission denial**
- [ ] **Step 5: Report `ADOPT` or `REJECT`; do not auto-promote to production**

**Verification routes:** staging preview article, staging preview page, соответствующие
published routes и public HTML этих же URL без preview cookie.

**Rollback:** restore exact frontend/Caddy snapshots and remove preview attributes.
Live Preview and main Studio remain functional.

---

### Task 19: Final Studio UX, full QA и release handoff

**Release:** R13, metadata/frontend polish only; no new schema or dependencies.

**Files:**
- Create: `docs/reports/directus-admin-final-qa.md`

Эта задача read-only относительно runtime и schema. Любой найденный дефект является
blocker и получает отдельную scope-locked задачу со своим allowed file list; исправлять
его внутри финального QA запрещено.

- [ ] **Step 1: Run complete Directus suite**

Run: `cd directus; npm test`

- [ ] **Step 2: Run complete frontend suite**

Run: `cd frontend; npm test; npm run typecheck; npm run lint; npm run build`

- [ ] **Step 3: Execute data invariants**

Expected: 12 971 products; no accidental unpublish; 18 categories unless separately
approved; 283/1 251/968 gallery reconciliation; 13 valid owner-XOR sections; no orphan
codes/analogs/editor nodes; leads/orders unchanged.

- [ ] **Step 4: Execute editor/admin scenarios**

Hero, page reorder/hide, rich-text-only article, mixed article sequence, product media,
specifications, documents, code, analog, SEO, draft/review/publish/archive, lead/order,
import dry-run/apply/rollback и content worker draft-only.

- [ ] **Step 5: Execute public route and metadata QA**

All home/catalog/category/product/article/info routes; sitemap, robots, JSON-LD,
canonical/OG; 404/redirect; laptop/mobile; accessibility; asset errors.

- [ ] **Step 6: Performance and security QA**

12 971 real and 30 000 synthetic products; no `limit=-1` search; endpoint pagination;
XSS corpus; preview token leakage; public `data-directus`; permissions matrix.

- [ ] **Step 7: Final diff and handoff**

Run: `git diff --name-only $env:JD_REVIEWED_BASE...HEAD`

Expected: union of individually approved release files only. Handoff records every
commit, backup ID, migration release ID, routes, reconciliation result and remaining
legacy fallback. Push/deployment выполняются только отдельной командой владельца.

**Verification routes:** `/`, `/catalog`, все 18 category routes, все три article
routes, все info routes, affected product routes из каждого release packet,
`/articles`, `/parts-request`, `/cart`, `/sitemap.xml`, `/robots.txt` и preview routes
из Task 16. Полный обход 12 971 product routes выполняется автоматическим HTTP checker,
а визуальная выборка определяется baseline strata: images/no-images, fixed/on-request
price, each category, codes и analog edges.

**Rollback:** не существует «общего отката всего проекта». Использовать rollback
конкретного release task в обратном порядке, начиная с последнего подтверждённого
cutover.

## Self-review checklist

- Все 10 решений владельца отражены в задачах и gates.
- Field-level ownership отражён в importer, worker и migration tasks.
- Decommission предшествует новым collections.
- Максимальный расчёт: 23 collections, либо 24 при доказанном CTA fallback.
- Article M2A не дублируется отдельными article M2M.
- Directus 12.2 не смешивается с editor pilot.
- SEO Plugin и Visual Editor начинаются только со staging spikes.
- Roles/permissions и headers остаются отдельными явно разрешаемыми security releases.
- Ни одна задача не удаляет защищённые collections.
- Каждый destructive/data cutover имеет backup, dry-run, before-state,
  reconciliation, routes и rollback.
- План не разрешает push или deployment.
