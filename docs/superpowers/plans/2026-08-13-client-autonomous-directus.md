# Client-Autonomous Directus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully Russian, client-autonomous Directus Studio in which homepage content—especially hero text and imagery—can be changed without code, and make the Next.js frontend render those saved values reliably.

**Architecture:** Add a `home_page` singleton as the editorial entry point while retaining `page_sections` as a hidden nested child collection for non-hero homepage sections. Apply Studio navigation, field groups, Russian labels, interfaces, notes, and user locale through an idempotent metadata blueprint; migrate existing published homepage data before switching the frontend adapter; keep existing presentational components but remove all content fallbacks and hardcoded hero media.

**Tech Stack:** Directus 12.1.1 REST API and Data Studio metadata, PostgreSQL 17, Node.js 20+, Next.js 16.2.12 App Router, React 19.2.8, TypeScript 5.9, Vitest 3.2, `next/image`.

## Global Constraints

- The Directus Studio, project collection names, field labels, choice labels, notes, validation messages, and managed role names must be Russian.
- Directus remains the only source of editable website content; the frontend must not contain invisible text or image substitutes for CMS values.
- Existing content and file IDs must be migrated before legacy entry points are hidden; no physical collection is deleted in this plan.
- The public website must not claim official John Deere representative status.
- Directus private tokens and revalidation secrets remain server-only.
- The implementation must remain within the Directus 12 Core limit; folder collections do not count toward that limit.
- Server Components remain the default; Client Components are used only for existing interactive features.
- The client edits supported sections, their content, links, visibility, and order; this iteration does not create an arbitrary new block-type builder.
- Existing unrelated worktree changes (`.tmp/` and `SECURITY-AUDIT.md`) are not modified or committed.

---

## Target File Structure

### Directus schema and Studio

- `directus/schema/blueprint.mjs` — database collections and fields, including `home_page`, collection folders, and the `page_sections.home_page` relationship that creates the `home_page.sections` O2M alias.
- `directus/schema/apply-schema.mjs` — idempotent creation of table-backed and folder collections.
- `directus/schema/studio-blueprint.mjs` — one source of truth for Russian navigation, hidden child collections, display templates, field groups, widths, notes, repeaters, and default locale.
- `directus/schema/apply-studio.mjs` — idempotently applies Studio metadata, project locale, and existing app-user locale.
- `directus/schema/ui-translations.mjs` — Russian vocabulary and choice labels reused by the Studio blueprint.
- `directus/migrations/migrate-home-page.mjs` — idempotent data migration from the published `pages`/`page_sections` homepage into `home_page`.
- `directus/access/blueprint.mjs` and `directus/access/apply-access.mjs` — permissions for `home_page` plus safe migration of managed role and policy names to Russian.
- `directus/flows/apply-revalidation-flow.mjs` — creates or updates the Directus event flow that calls the protected Next.js revalidation endpoint.

### Frontend

- `frontend/src/types/content.ts` — normalized homepage/section types, including CMS hero image alt and search copy.
- `frontend/src/lib/directus/content.ts` — reads `home_page`, validates required hero content, maps nested sections, and keeps informational page reads separate.
- `frontend/src/app/HomePageView.tsx` — renders only CMS-provided visible sections and never creates content fallbacks.
- `frontend/src/components/sections/HomeHero.tsx` — renders CMS text, media, alt, buttons, and benefits.
- `frontend/src/components/sections/HeroPartSearch.tsx` — accepts CMS-controlled placeholder and accessible label/button copy.
- `frontend/src/app/media/[fileId]/route.ts` — recognizes a published `home_page.hero_image` when a migrated file is not in the public folder.
- `frontend/src/app/api/revalidate/route.ts` — maps `home_page` events to immediate homepage invalidation.

---

### Task 1: Add the homepage singleton and collection folders

**Files:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/apply-schema.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/apply-schema.test.mjs`
- Modify: `directus/schema/platform-compatibility.test.mjs`

**Interfaces:**
- Produces: Directus collection `home_page`; M2O field `page_sections.home_page`; O2M alias `home_page.sections`; folder collections `group_site`, `group_catalog`, `group_content`, `group_sales`, `group_settings`.
- Consumes: existing `field()`, `contentFields()`, `buildCollectionPayload()`, and `applyBlueprint()` schema helpers.

- [ ] **Step 1: Write failing schema tests for folders, singleton fields, and relations**

Add assertions equivalent to:

```js
const home = schemaBlueprint.collections.find(({ name }) => name === "home_page");
assert.equal(home.singleton, true);
assert.deepEqual(
  new Set(home.fields.map(({ name }) => name)),
  new Set([
    "id", "status", "source_page", "h1", "hero_title", "hero_text",
    "hero_image", "hero_image_alt", "hero_primary_button_text",
    "hero_primary_button_url", "hero_secondary_button_text",
    "hero_secondary_button_url", "hero_search_label", "hero_search_placeholder",
    "hero_search_button_text", "hero_bulk_prompt", "hero_bulk_link_text",
    "hero_bulk_link_url", "hero_excel_link_text", "hero_excel_link_url",
    "hero_photo_link_text", "hero_photo_link_url", "seo_title", "seo_description",
    "canonical_url", "og_title", "og_description", "og_image",
    "is_indexable", "translations", "created_at", "updated_at",
  ]),
);

const folders = schemaBlueprint.collections.filter(({ folder }) => folder);
assert.deepEqual(folders.map(({ name }) => name), [
  "group_site", "group_catalog", "group_content", "group_sales", "group_settings",
]);

const section = schemaBlueprint.collections.find(({ name }) => name === "page_sections");
assert.equal(
  section.fields.find(({ name }) => name === "home_page").relatedCollection,
  "home_page",
);
```

Update the compatibility assertion to count only table-backed non-folder collections:

```js
const counted = schemaBlueprint.collections.filter(({ folder }) => !folder);
assert.ok(counted.length <= 25);
```

- [ ] **Step 2: Run the Directus schema tests and confirm failure**

Run: `npm test -- --test-name-pattern="homepage|folder|collection limit"`

Working directory: `directus`

Expected: FAIL because `home_page` and folder payload support do not exist.

- [ ] **Step 3: Extend the schema blueprint**

Add folder records with `folder: true`, empty fields, icons, and fixed ordering. Add the singleton with the exact fields listed in Step 1. Use these field rules:

```js
field("hero_image", "uuid", {
  required: true,
  relatedCollection: "directus_files",
  interface: "file-image",
});
field("home_page", "uuid", {
  relatedCollection: "home_page",
  oneField: "sections",
  index: true,
});
```

Add the shown field and a nullable `image_alt` string to `page_sections`, not `home_page`. Directus creates the `home_page.sections` O2M alias when the relation with `oneField: "sections"` is installed. Keep the existing required `page` field during this migration so no legacy row becomes invalid. Include the existing JSON `translations()` field in `home_page` for future multilingual content.

- [ ] **Step 4: Support schema-less folder collections in the installer**

Make `buildCollectionPayload()` return this shape for a folder:

```js
if (collection.folder) {
  return {
    collection: collection.name,
    meta: {
      icon: collection.icon ?? "folder",
      hidden: false,
      singleton: false,
      sort: collection.sort ?? null,
    },
    schema: null,
  };
}
```

Skip `/fields/{collection}` and relation processing for folder records. Preserve current behavior for table-backed collections.

- [ ] **Step 5: Run the full Directus schema test suite**

Run: `npm run schema:check && node --test schema/apply-schema.test.mjs`

Working directory: `directus`

Expected: PASS; 25 or fewer table-backed project collections and five excluded folders.

- [ ] **Step 6: Commit the schema foundation**

```powershell
git add directus/schema/blueprint.mjs directus/schema/apply-schema.mjs directus/schema/blueprint.test.mjs directus/schema/apply-schema.test.mjs directus/schema/platform-compatibility.test.mjs
git commit -m "feat: add editable homepage schema"
```

---

### Task 2: Build the Russian Directus Studio information architecture

**Files:**
- Create: `directus/schema/studio-blueprint.mjs`
- Create: `directus/schema/apply-studio.mjs`
- Create: `directus/schema/studio-blueprint.test.mjs`
- Create: `directus/schema/apply-studio.test.mjs`
- Modify: `directus/schema/ui-translations.mjs`
- Modify: `directus/schema/ui-translations.test.mjs`
- Modify: `directus/package.json`
- Modify: `directus/README.md`

**Interfaces:**
- Produces: `studioBlueprint`; `applyStudioBlueprint(client, blueprint, { dryRun })`.
- Consumes: `DirectusAdminClient`, Russian translation helpers, schema collection keys from Task 1.

- [ ] **Step 1: Write failing tests for the five navigation groups and hidden children**

Assert the following assignments:

```js
assert.deepEqual(studioBlueprint.collections.home_page, {
  label: "Главная страница",
  group: "group_site",
  icon: "home",
  sort: 1,
  hidden: false,
  singleton: true,
});
assert.equal(studioBlueprint.collections.products.group, "group_catalog");
assert.equal(studioBlueprint.collections.articles.group, "group_content");
assert.equal(studioBlueprint.collections.leads.group, "group_sales");
assert.equal(studioBlueprint.collections.site_settings.group, "group_settings");

for (const key of [
  "page_sections", "product_images", "product_specifications",
  "product_documents", "order_items", "contact_channels", "hero_blocks",
  "advantages", "cta_blocks", "seo_text_blocks", "banners", "testimonials",
]) {
  assert.equal(studioBlueprint.collections[key].hidden, true, key);
}
```

Also test that every folder, visible collection, and managed field has a Russian label and note where meaning is not self-evident.

- [ ] **Step 2: Write failing tests for field layout metadata**

Require these `home_page` groups and roles:

```js
assert.deepEqual(Object.keys(studioBlueprint.fields.home_page.groups), [
  "group_main", "group_hero", "group_sections", "group_seo", "group_system",
]);
assert.equal(
  studioBlueprint.fields.home_page.fields.hero_image.group,
  "group_hero",
);
assert.equal(
  studioBlueprint.fields.home_page.fields.sections.interface,
  "list-o2m",
);
assert.equal(
  studioBlueprint.fields.products.fields.specifications.interface,
  "list",
);
assert.equal(
  studioBlueprint.fields.site_settings.fields.messengers.interface,
  "list",
);
```

- [ ] **Step 3: Run the new Studio tests and confirm failure**

Run: `node --test schema/studio-blueprint.test.mjs schema/apply-studio.test.mjs`

Working directory: `directus`

Expected: FAIL because the Studio blueprint and applier do not exist.

- [ ] **Step 4: Define the Studio blueprint**

Use one dominant native Directus layout: light Studio canvas, task folders, full-width primary editorial fields, half-width paired fields, closed SEO/system accordions, and no custom decorative UI.

Configure folders as:

```js
folders: {
  group_site: { label: "Сайт", icon: "web", sort: 1 },
  group_catalog: { label: "Каталог", icon: "inventory_2", sort: 2 },
  group_content: { label: "Контент", icon: "article", sort: 3 },
  group_sales: { label: "Продажи", icon: "request_quote", sort: 4 },
  group_settings: { label: "Настройки", icon: "settings", sort: 5 },
}
```

Use `group-detail` for open `Основное`/`Первый экран` groups and `group-accordion` with `start: "closed"` for SEO and system groups. Configure JSON repeaters with `interface: "list"`, Russian subfield labels, and item templates rather than `input-code` for:

- `products.specifications` (`Название`, `Значение`, `Единица`);
- `products.gallery` (`Изображение`, `Alt-текст`, `Порядок`);
- `products.documents` (`Название`, `Файл`);
- `site_settings.messengers` (`Название`, `Ссылка`, `Иконка`);
- `page_sections.items` (`Заголовок`, `Текст`, `Иконка`, `Ссылка`) where applicable.

Configure the nested `page_sections` form with groups `Основное`, `Контент`, `Элементы`, `Кнопка`, `Служебное`. Use field conditions keyed by `section_type`: hide `items` for `contacts`, `lead_form`, and `seo_text`; hide button fields for `categories`, `featured_products`, `advantages`, `recent_supplies`, `articles`, and `faq`; keep `image` and `image_alt` together and hide them for section types that the frontend does not render with media. This prevents the client from seeing controls that cannot affect the selected section type.

Set display templates:

```js
products: "{{title}} · {{sku}} · {{availability_status}}",
categories: "{{title}} · /{{slug}}",
leads: "{{name}} · {{phone}} · {{status}} · {{created_at}}",
orders: "{{customer_name}} · {{total}} · {{status}} · {{created_at}}",
pages: "{{title}} · /{{slug}} · {{status}}",
```

- [ ] **Step 5: Implement the idempotent Studio metadata applier**

`applyStudioBlueprint()` must:

1. GET `/collections`, PATCH only changed `meta.translations`, `meta.group`, `meta.hidden`, `meta.sort`, `meta.icon`, `meta.display_template`, and `meta.note`.
2. GET `/fields/{collection}`, create missing alias group fields through `/fields/{collection}`, then PATCH only changed field metadata (`translations`, `interface`, `options`, `display`, `display_options`, `note`, `width`, `sort`, `group`, `hidden`, `readonly`).
3. PATCH `/settings` with `{ default_language: "ru-RU" }` when needed.
4. GET `/users?filter[status][_neq]=archived&fields=id,language&limit=-1` and PATCH existing app users to `{ language: "ru-RU" }` when their language differs.
5. Produce deterministic dry-run action text and no PATCH calls when metadata already matches.

Keep `schema:translations` as a compatibility alias to the new command and add:

```json
"schema:studio": "node schema/apply-studio.mjs"
```

- [ ] **Step 6: Run Studio and translation tests**

Run: `node --test schema/studio-blueprint.test.mjs schema/apply-studio.test.mjs schema/ui-translations.test.mjs`

Working directory: `directus`

Expected: PASS, including a second idempotent invocation with zero actions.

- [ ] **Step 7: Commit the Russian Studio configuration**

```powershell
git add directus/schema/studio-blueprint.mjs directus/schema/apply-studio.mjs directus/schema/studio-blueprint.test.mjs directus/schema/apply-studio.test.mjs directus/schema/ui-translations.mjs directus/schema/ui-translations.test.mjs directus/package.json directus/README.md
git commit -m "feat: organize Directus Studio in Russian"
```

---

### Task 3: Migrate managed roles and homepage access safely

**Files:**
- Modify: `directus/access/blueprint.mjs`
- Modify: `directus/access/apply-access.mjs`
- Modify: `directus/access/blueprint.test.mjs`
- Modify: `directus/access/apply-access.test.mjs`

**Interfaces:**
- Produces: Russian managed roles/policies without duplicating existing English roles; permissions for `home_page`.
- Consumes: `home_page` collection from Task 1 and existing role/policy IDs.

- [ ] **Step 1: Write failing permission and role-migration tests**

Require:

```js
assert.ok(frontendCollections.includes("home_page"));
assert.deepEqual(contentManagerRole.existingNames, ["Content Manager"]);
assert.equal(contentManagerRole.name, "Контент-менеджер");
assert.equal(salesManagerRole.name, "Менеджер продаж");
assert.equal(seoManagerRole.name, "SEO-менеджер");
```

Mock an existing `Content Manager` role and policy and assert that the applier PATCHes their names rather than POSTing duplicates.

- [ ] **Step 2: Run access tests and confirm failure**

Run: `node --test access/blueprint.test.mjs access/apply-access.test.mjs`

Working directory: `directus`

Expected: FAIL on missing `home_page` permissions and rename support.

- [ ] **Step 3: Add `home_page` permissions and Russian managed names**

Grant:

- Frontend API: read `home_page`.
- Контент-менеджер: read/update `home_page` (singleton creation remains an administrator/migration responsibility).
- SEO-менеджер: read/update `home_page`.
- Менеджер продаж: no `home_page` write access.

Rename technical roles to `API фронтенда`, `Контент-менеджер`, `Менеджер продаж`, and `SEO-менеджер`; provide the current English names in `existingNames`/`existingPolicyNames`.

- [ ] **Step 4: Update the access applier to reuse and rename managed objects**

Resolve a role or policy by the desired name first, then by each legacy name. When a legacy match is found, PATCH its `name`, `description`, and `icon`, retain its ID, and continue reconciling access and permissions against that ID.

- [ ] **Step 5: Run all access tests**

Run: `node --test access/*.test.mjs`

Working directory: `directus`

Expected: PASS with no duplicate-role POST in the migration test.

- [ ] **Step 6: Commit permissions and Russian roles**

```powershell
git add directus/access/blueprint.mjs directus/access/apply-access.mjs directus/access/blueprint.test.mjs directus/access/apply-access.test.mjs
git commit -m "feat: localize Directus roles and homepage access"
```

---

### Task 4: Migrate the live homepage data without losing file IDs

**Files:**
- Create: `directus/migrations/migrate-home-page.mjs`
- Create: `directus/migrations/migrate-home-page.test.mjs`
- Modify: `directus/package.json`
- Modify: `directus/README.md`

**Interfaces:**
- Produces: `buildHomePagePayload(page, heroSection)` and `migrateHomePage(client, { dryRun })`.
- Consumes: current published `pages.slug=home`, its `page_sections`, and the singleton schema from Task 1.

- [ ] **Step 1: Write a failing pure mapping test**

Use a fixture containing the current title, text, and image ID and require exact preservation:

```js
assert.deepEqual(buildHomePagePayload(page, hero), {
  status: "published",
  source_page: "1cd1d1bc-95d3-43bd-a2d0-ffd4f7757229",
  h1: "Запчасти и комплектующие John Deere",
  hero_title: "Запчасти и комплектующие John Deere",
  hero_text: "Найдём нужную деталь по артикулу, модели техники или фотографии маркировки.",
  hero_image: "d6705156-10bf-4920-95d1-1ff011f54e70",
  hero_image_alt: "Запчасти и комплектующие John Deere",
  hero_primary_button_text: "Отправить запрос",
  hero_primary_button_url: "#consultation",
  hero_secondary_button_text: null,
  hero_secondary_button_url: null,
  hero_search_label: "Поиск по каталогу",
  hero_search_placeholder: "Введите артикул детали",
  hero_search_button_text: "Найти",
  hero_bulk_prompt: "Нужно проверить несколько позиций?",
  hero_bulk_link_text: "Вставить список",
  hero_bulk_link_url: "/parts-request",
  hero_excel_link_text: "Загрузить Excel",
  hero_excel_link_url: "/parts-request?mode=excel#attachments",
  hero_photo_link_text: "Отправить фото",
  hero_photo_link_url: "/parts-request?mode=photo#attachments",
  seo_title: page.seo_title,
  seo_description: page.seo_description,
  canonical_url: page.canonical_url,
  og_title: page.og_title,
  og_description: page.og_description,
  og_image: page.og_image,
  is_indexable: page.is_indexable,
});
```

The migration intentionally captures the currently visible request/search microcopy from frontend constants into Directus. This is a one-time transfer of existing behavior, not a permanent frontend fallback. After migration, the corresponding React constants are removed.

- [ ] **Step 2: Write failing idempotency and safety tests**

Require the migration to:

- abort before PATCH when no published home page exists;
- abort when there is not exactly one visible published hero section;
- abort when title, text, or image is absent;
- PATCH `/items/home_page` once;
- PATCH each non-hero homepage section with `home_page: <singleton-id>` while retaining its existing `page` value;
- produce zero writes when the singleton and all section links already match.

- [ ] **Step 3: Run migration tests and confirm failure**

Run: `node --test migrations/migrate-home-page.test.mjs`

Working directory: `directus`

Expected: FAIL because the migration does not exist.

- [ ] **Step 4: Implement the migration and CLI**

Add CLI flags `--dry-run` and `--apply`; default to dry-run. Require `--apply` for writes. Fetch explicit fields only. Log field names and record IDs, never credentials or token values.

Add:

```json
"migrate:home-page": "node migrations/migrate-home-page.mjs"
```

- [ ] **Step 5: Run migration tests**

Run: `node --test migrations/migrate-home-page.test.mjs`

Working directory: `directus`

Expected: PASS.

- [ ] **Step 6: Commit the migration**

```powershell
git add directus/migrations/migrate-home-page.mjs directus/migrations/migrate-home-page.test.mjs directus/package.json directus/README.md
git commit -m "feat: migrate homepage content into Directus singleton"
```

---

### Task 5: Switch the frontend homepage adapter to `home_page`

**Files:**
- Modify: `frontend/src/types/content.ts`
- Modify: `frontend/src/lib/directus/content.ts`
- Modify: `frontend/src/lib/directus/content.test.ts`
- Modify: `frontend/src/app/HomePageView.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Produces: `getHomePage(): Promise<ContentPage | null>` backed by `home_page`; `PageSection.imageAlt`; `PageSection.settings` hero search/button values.
- Consumes: migrated singleton and linked `page_sections` from Task 4.

- [ ] **Step 1: Replace the homepage query test with a failing singleton contract**

Mock the first request as a singleton object and the second as linked sections. Require:

```ts
expect(requestMock.mock.calls[0][0]).toContain("/items/home_page?");
expect(page).toEqual(expect.objectContaining({
  id: "legacy-home-page-id",
  h1: "Запчасти John Deere",
  seoTitle: "Каталог запчастей",
}));
expect(page?.sections[0]).toEqual(expect.objectContaining({
  type: "hero",
  title: "Редактируемый hero",
  text: "Текст из Directus",
  imageId: "cms-hero-image",
  imageAlt: "Склад запчастей John Deere",
}));
```

Also assert both requests use `{ next: { revalidate: 300, tags: ["homepage"] } }` and that missing required hero data rejects with `Invalid homepage hero content`.

- [ ] **Step 2: Write a failing rendering test proving fallbacks are gone**

Render a page containing only hero and assert that headings such as `Категории продукции`, `Избранные товары`, and `Вопросы и ответы` do not appear unless their CMS sections exist.

Add a second test with `articles.sortOrder = 10` and `categories.sortOrder = 20`; assert the articles heading occurs before the categories heading in `container.textContent`. Hero remains first. Treat `advantages` as hero support, `cta` as process support, and `lead_form` as contact-hub support; their order is inherited from the visible parent section rather than rendered as duplicate standalone blocks.

- [ ] **Step 3: Run focused frontend tests and confirm failure**

Run: `npm test -- src/lib/directus/content.test.ts src/app/page.test.tsx`

Working directory: `frontend`

Expected: FAIL on the old `pages.slug=home` request and fallback sections.

- [ ] **Step 4: Add raw singleton types and an explicit mapper**

Read these fields from `/items/home_page`:

```ts
"id,status,source_page,h1,hero_title,hero_text,hero_image,hero_image_alt," +
"hero_primary_button_text,hero_primary_button_url,hero_secondary_button_text," +
"hero_secondary_button_url,hero_search_label,hero_search_placeholder," +
"hero_search_button_text,hero_bulk_prompt,hero_bulk_link_text,hero_bulk_link_url," +
"hero_excel_link_text,hero_excel_link_url,hero_photo_link_text,hero_photo_link_url," +
"seo_title,seo_description,canonical_url,og_title," +
"og_description,og_image,is_indexable"
```

Create the normalized hero `PageSection` directly from singleton fields, then append linked visible published sections sorted by `sort_order`. Keep `getPageBySlug()` unchanged for non-home informational pages.

Use `source_page` as `ContentPage.id` so existing FAQ relations continue to resolve against the legacy `pages.home` record during the non-destructive migration.

- [ ] **Step 5: Remove fallback section construction**

Delete `fallbackSection()`. Make hero required at the adapter boundary. Render optional primary sections through an ordered switch over `page.sections.sort((a, b) => a.sortOrder - b.sortOrder)`. The switch must render `categories`, `featured_products`, `process`, `company_trust`, `recent_supplies`, `articles`, `faq`, and `contacts`; it must skip the already-rendered hero and the supporting `advantages`, `cta`, `lead_form`, and `seo_text` entries. Pass the supporting records to hero/process/contact components through `find(type)`. Continue slicing product/article datasets inside their components, but never invent titles or copy.

- [ ] **Step 6: Run content and homepage tests**

Run: `npm test -- src/lib/directus/content.test.ts src/app/page.test.tsx`

Working directory: `frontend`

Expected: PASS.

- [ ] **Step 7: Commit the homepage data adapter**

```powershell
git add frontend/src/types/content.ts frontend/src/lib/directus/content.ts frontend/src/lib/directus/content.test.ts frontend/src/app/HomePageView.tsx frontend/src/app/page.test.tsx
git commit -m "feat: read homepage content from Directus singleton"
```

---

### Task 6: Render editable hero media and copy end to end

**Files:**
- Modify: `frontend/src/components/sections/HomeHero.tsx`
- Modify: `frontend/src/components/sections/HomeHero.test.tsx`
- Modify: `frontend/src/components/sections/HeroPartSearch.tsx`
- Modify: `frontend/src/components/sections/HeroPartSearch.test.tsx`
- Modify: `frontend/src/app/media/[fileId]/route.ts`
- Modify: `frontend/src/app/media/[fileId]/route.test.ts`

**Interfaces:**
- Produces: hero rendered exclusively from CMS props; editable search label/placeholder/button; media authorization for published singleton hero images.
- Consumes: `PageSection.imageId`, `PageSection.imageAlt`, and hero settings from Task 5; `directusAssetUrl()`.

- [ ] **Step 1: Write the failing hero CMS-media test**

Replace the local-image assertion with:

```ts
expect(image).toHaveAttribute("alt", "Склад запчастей");
expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain(
  "/media/9af727df-c55a-48d9-bbd0-458a18237068",
);
expect(decodeURIComponent(image?.getAttribute("src") ?? "")).not.toContain(
  "/images/home/deere-shop-hero-v2.webp",
);
```

Add assertions that an empty benefits array renders zero benefit rows and that CMS button text/URL are used.

- [ ] **Step 2: Write failing search-copy tests**

Render:

```tsx
<HeroPartSearch
  buttonText="Искать"
  bulkLink={{ text: "Список деталей", url: "/parts-request" }}
  bulkPrompt="Несколько позиций?"
  excelLink={{ text: "Файл Excel", url: "/parts-request?mode=excel" }}
  label="Поиск запчасти"
  photoLink={{ text: "Фото маркировки", url: "/parts-request?mode=photo" }}
  placeholder="Артикул или название"
/>
```

Assert the accessible name, placeholder, button label, prompt, three link labels, and three URLs exactly match the props.

- [ ] **Step 3: Write a failing media-route test for singleton images**

For a root-level file, mock an empty `page_sections` result followed by:

```json
{
  "data": {
    "id": "home-page-id",
    "status": "published",
    "hero_image": "9af727df-c55a-48d9-bbd0-458a18237068"
  }
}
```

Require HTTP 200 and an upstream `/assets/{fileId}` request.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `npm test -- src/components/sections/HomeHero.test.tsx src/components/sections/HeroPartSearch.test.tsx src/app/media/[fileId]/route.test.ts`

Working directory: `frontend`

Expected: FAIL because hero still uses the local WebP and search copy is hardcoded.

- [ ] **Step 5: Remove hero content constants and use the Directus asset URL**

Delete `HERO_TITLE`, `HERO_SUBTITLE`, and `DEFAULT_BENEFITS`. Build the image URL with:

```ts
const imageUrl = directusAssetUrl(section.imageId, {
  width: 1920,
  quality: 84,
  format: "webp",
});
```

Render media only when `imageUrl` exists, using `section.imageAlt ?? ""`. Pass CMS search copy into `HeroPartSearch`. Render primary/secondary CTA only when text and URL are both present.

- [ ] **Step 6: Extend media authorization**

Add `isPublishedHomeHeroImage(fileId)` that reads `id,status,hero_image` from the singleton and returns true only when status is `published` and the normalized file ID equals `fileId`. Permit media when any of these is true: public folder, published section image, published singleton hero image.

- [ ] **Step 7: Run all hero and media tests**

Run: `npm test -- src/components/sections/HomeHero.test.tsx src/components/sections/HeroPartSearch.test.tsx src/app/media/[fileId]/route.test.ts`

Working directory: `frontend`

Expected: PASS with no reference to `deere-shop-hero-v2.webp` in production hero code.

- [ ] **Step 8: Commit editable hero rendering**

```powershell
git add frontend/src/components/sections/HomeHero.tsx frontend/src/components/sections/HomeHero.test.tsx frontend/src/components/sections/HeroPartSearch.tsx frontend/src/components/sections/HeroPartSearch.test.tsx 'frontend/src/app/media/[fileId]/route.ts' 'frontend/src/app/media/[fileId]/route.test.ts'
git commit -m "fix: render homepage hero from Directus"
```

---

### Task 7: Automate immediate revalidation after Directus saves

**Files:**
- Create: `directus/flows/apply-revalidation-flow.mjs`
- Create: `directus/flows/apply-revalidation-flow.test.mjs`
- Modify: `directus/package.json`
- Modify: `directus/.env.example`
- Modify: `deploy/compose.production.yml`
- Modify: `frontend/src/app/api/revalidate/route.ts`
- Modify: `frontend/src/app/api/revalidate/route.test.ts`
- Modify: `directus/README.md`
- Modify: `deploy/README.md`

**Interfaces:**
- Produces: `applyRevalidationFlow(client, config, { dryRun })`; Directus event hook for `items.create`, `items.update`, and `items.delete`; `home_page` allowlist support.
- Consumes: `NEXT_REVALIDATE_URL`, `REVALIDATE_SECRET`, protected Next.js `POST /api/revalidate`.

- [ ] **Step 1: Write the failing Next.js route test**

POST `{ "collection": "home_page" }` with a valid secret and require:

```ts
expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
expect(response.status).toBe(200);
```

- [ ] **Step 2: Write failing Directus flow reconciliation tests**

Mock `/flows`, `/operations`, and require an idempotent flow named `Ревалидация сайта` with:

- event trigger scopes `items.create`, `items.update`, `items.delete`;
- collections `home_page`, `page_sections`, `site_settings`, `navigation_items`, `categories`, `products`, `articles`, `faq_items`, `recent_supplies`;
- a request operation that POSTs `{ "collection": "{{$trigger.collection}}" }`;
- header `x-revalidate-secret` sourced from the process environment;
- no secret value in dry-run output.

- [ ] **Step 3: Run focused route and flow tests and confirm failure**

Run: `npm test -- src/app/api/revalidate/route.test.ts`

Working directory: `frontend`

Run: `node --test flows/apply-revalidation-flow.test.mjs`

Working directory: `directus`

Expected: FAIL because `home_page` and flow provisioning are absent.

- [ ] **Step 4: Add `home_page` revalidation mapping**

Map both `home_page` and `home-page` to `['homepage']` and IndexNow path `/`.

- [ ] **Step 5: Implement flow provisioning**

Require both environment variables and fail before API writes if either is absent. Resolve the managed flow by exact name, create it when missing, and PATCH its trigger/options plus the request operation when drift is detected. Add:

```json
"flows:revalidation": "node flows/apply-revalidation-flow.mjs"
```

Pass `NEXT_REVALIDATE_URL` and `REVALIDATE_SECRET` to the Directus service in production compose without exposing them to the browser.

- [ ] **Step 6: Run route and flow tests**

Run: `npm test -- src/app/api/revalidate/route.test.ts`

Working directory: `frontend`

Run: `node --test flows/apply-revalidation-flow.test.mjs`

Working directory: `directus`

Expected: PASS.

- [ ] **Step 7: Commit automated revalidation**

```powershell
git add directus/flows/apply-revalidation-flow.mjs directus/flows/apply-revalidation-flow.test.mjs directus/package.json directus/.env.example deploy/compose.production.yml frontend/src/app/api/revalidate/route.ts frontend/src/app/api/revalidate/route.test.ts directus/README.md deploy/README.md
git commit -m "feat: revalidate frontend after Directus saves"
```

---

### Task 8: Apply, verify, and document the client workflow

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`
- Modify: `DIRECTUS_COLLECTIONS_PLAN.md`
- Modify: `directus/schema/snapshot.json`
- Create: `docs/implementation/directus-client-workflow.md`

**Interfaces:**
- Produces: verified live Directus schema/metadata/data/access/flow and a Russian client handoff guide.
- Consumes: all previous tasks.

- [ ] **Step 1: Run all repository tests before applying live changes**

Run: `npm test`

Working directory: `directus`

Run: `npm test && npm run typecheck && npm run lint && npm run build`

Working directory: `frontend`

Expected: all commands PASS.

- [ ] **Step 2: Back up the local Directus database before migration**

Resolve the compose project database service and write a timestamped PostgreSQL dump under `.tmp/backups/`; verify the dump is non-empty. Do not commit the dump.

Run from repository root with the credentials already present in `directus/.env`:

```powershell
New-Item -ItemType Directory -Force -Path '.tmp/backups' | Out-Null
docker compose --env-file directus/.env -f directus/docker-compose.yml exec -T database pg_dump -U postgres directus > '.tmp/backups/directus-before-client-admin.sql'
```

If the configured database/user names differ, read their exact values from `directus/.env` into task-specific variables and use those values without printing them.

- [ ] **Step 3: Dry-run every Directus change**

Load `directus/.env` into the process without echoing values, then run from `directus`:

```powershell
npm run schema:apply -- --dry-run
npm run schema:studio -- --dry-run
npm run access:apply -- --dry-run
npm run migrate:home-page -- --dry-run
npm run flows:revalidation -- --dry-run
```

Expected: only the planned folders, singleton, fields, metadata, permissions, migration, and managed flow appear.

- [ ] **Step 4: Apply schema, migration, Studio metadata, permissions, and flow in safe order**

Run from `directus`:

```powershell
npm run schema:apply
npm run migrate:home-page -- --apply
npm run schema:studio
npm run access:apply
npm run flows:revalidation
npm run schema:snapshot
```

Run the same commands a second time with `--dry-run`; expected output is zero changes.

- [ ] **Step 5: Verify the live Directus information architecture through its API**

Using an authenticated read-only inspection request, verify:

- `home_page` is singleton, visible, Russian, and nested under `Сайт`;
- five folder collections exist;
- listed child collections are hidden;
- every visible project collection has a Russian label;
- `home_page.hero_title`, `hero_text`, `hero_image`, and `hero_image_alt` equal migrated values;
- linked homepage sections retain their legacy `page` relation and have `home_page` set;
- existing app users have `ru-RU` locale;
- no second Content Manager/Sales Manager/SEO Manager role was created.

- [ ] **Step 6: Perform the real hero edit round trip**

Use a reversible control value:

1. Save the current `hero_title`, `hero_text`, `hero_image`, and `hero_image_alt` in task-local memory.
2. PATCH only `hero_title` to `Проверка Directus: первый экран редактируется`.
3. Trigger the managed revalidation flow or call the protected local revalidation route exactly as the flow does.
4. Request the running homepage and assert the control title is present.
5. PATCH `hero_image` to a known public test asset, request the homepage, and assert the rendered `/media/{fileId}` URL changed.
6. Restore all four original values and revalidate again.
7. Request the homepage and confirm the original title and image are restored.

Do not leave control copy or a test image in published content.

- [ ] **Step 7: Verify the editor workflow in a browser**

Sign in as a non-admin content manager and verify:

- the Studio chrome and project content labels are Russian;
- the five task folders are visible in the intended order;
- `Главная страница → Первый экран` exposes text, image, alt, buttons, and search copy;
- product specifications/gallery/documents use friendly nested interfaces, not raw JSON;
- technical collections are absent from top-level navigation;
- keyboard focus, file upload, save feedback, and laptop-width layout work.

Capture any actionable drift and fix it before continuing.

- [ ] **Step 8: Write the Russian client guide and update architecture docs**

Document these exact workflows with screenshots or precise menu paths:

- change hero text/image;
- publish or hide a homepage section;
- edit contacts and messengers;
- add/edit a category and product;
- edit SEO fields;
- process a lead/order;
- recover from validation errors;
- distinguish draft and published content.

Update collection documentation to identify visible, nested-hidden, legacy-hidden, and system collections.

- [ ] **Step 9: Run final verification**

Run: `npm test`

Working directory: `directus`

Run: `npm test && npm run typecheck && npm run lint && npm run build`

Working directory: `frontend`

Run: `git diff --check`

Working directory: repository root

Expected: all PASS; only intended files changed; `.tmp/backups` remains untracked/ignored.

- [ ] **Step 10: Commit verified handoff documentation and snapshot**

```powershell
git add README.md HANDOFF.md DIRECTUS_COLLECTIONS_PLAN.md directus/schema/snapshot.json docs/implementation/directus-client-workflow.md
git commit -m "docs: hand off autonomous Directus workflow"
```

---

## Completion Gate

Do not claim completion until all conditions are true:

- The hero title and image have each completed a real Directus → Next.js → browser round trip.
- No production homepage component references `/images/home/deere-shop-hero-v2.webp` or content fallback constants.
- The Directus Studio is Russian for existing app users and defaults to Russian for new users.
- The five task groups and nested hidden collections are verified in the live Studio.
- Schema, Studio configuration, access, migration, and flow commands are idempotent.
- Directus tests, frontend tests, typecheck, lint, and production build pass.
- Existing content and file IDs remain intact after migration.
- A database backup exists outside Git before live schema/data changes.
