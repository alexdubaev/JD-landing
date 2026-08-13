# Directus Admin Reversible Architecture Design

## Статус и цель

Статус: согласовано владельцем 13 августа 2026 года.

Цель — превратить существующую Directus Studio Deere-Shop в понятную рабочую панель
для редакторов, SEO, продаж и импорта, сохранив штатные возможности Directus и
выпуская каждое изменение отдельным обратимым релизом.

Реализация не создаёт собственные admin shell, CRUD, Media Manager, relation picker,
page builder, dashboard framework, ACL, history/versioning, universal importer,
Tiptap wrapper, table editor, Visual Editor или module shell контент-завода.

## Неподлежащий изменению baseline

- Directus production: 12.1.1; production пока не обновляется.
- PostgreSQL 17; контейнерный Node.js 22.
- Frontend: Next.js 16.2.12, React 19.2.8, TypeScript 5.9.3.
- 12 971 товаров, все опубликованы и входят в scope.
- 283 товара имеют legacy gallery; в них 1 251 file reference.
- При хранении main image отдельно ожидаются 968 `product_images`.
- 18 категорий, 3 статьи, 2 страницы, 13 `page_sections`, 12 FAQ и 4 заявки.
- 11 `page_sections` одновременно имеют `page` и `home_page`.
- 25 физических коллекций — текущий Core limit.
- Чужие untracked-файлы рабочей копии не принадлежат реализации.

## Архитектурные принципы

### 1. Штатная Studio как control plane

Формы, списки, Files, relations, Activity, Revisions, Content Versioning, Live
Preview, bookmarks, presets и Insights используются штатно. Extensions допускаются
только после compatibility/security gates и только для доказанного пробела.

### 2. Владение на уровне полей

Правила [ADR-003](../../decisions/ADR-003-field-level-source-of-truth.md) применяются
ко всем importer, worker и source-of-truth миграциям. Ни один feed не владеет товаром
целиком.

### 3. Additive → dual-read → cutover → decommission

Новая модель сначала добавляется рядом со старой. Frontend получает fallback. Данные
переносятся с before-state и reconciliation. Cutover утверждается отдельно. Legacy
удаляется только после периода проверки и отдельного backup.

### 4. Один источник связи

Embedded product/category relations статьи хранятся в M2A junction Flexible Editor.
Отдельные article↔products/article↔categories M2M не создаются, пока не появится
подтверждённый сценарий связи, которая не должна присутствовать в body.

### 5. Публикация всегда человеческая

Author/SEO Editor создаёт draft и переводит материал в ready/review. Только
Publisher/Admin выполняет promote/publish. Worker не публикует контент. Массовые slug,
URL и source-of-truth миграции утверждает Admin/Owner.

## Бюджет коллекций

После безопасного удаления `hero_blocks`, `advantages`, `cta_blocks`,
`seo_text_blocks`, `banners`, `testimonials` остаётся 19 физических коллекций.

Целевая минимальная добавка:

- `articles_editor_nodes` — M2A junction для article body;
- `products_analogs` — типизированные связи товаров;
- `product_codes` — дополнительные внешние коды;
- `seo_work_items` — control plane контент-завода.

Итого 23 коллекции и два резервных слота. Если pilot докажет, что самостоятельный CTA
невозможно представить relation node без дублирования target data, разрешается
`article_cta_blocks`; тогда будет 24 коллекции и один резервный слот.

Коллекции складов, поставщиков, цен, брендов, reusable FAQ и дополнительные M2A не
создаются без реального feed contract и отдельного доказательства.

## Целевые модели

### Article body

Существующее `articles.content` остаётся HTML fallback. Добавляются:

- `articles.content_blocks` — nullable JSON Flexible Editor;
- `articles.editor_nodes` — скрытый M2A alias;
- `articles_editor_nodes` — junction с owner, target collection и target item.

Поддерживается последовательность:

```text
rich text → product → rich text → CTA → category → table → rich text
```

Relation nodes хранят ссылки на реальные `products` и `categories`; title, price,
slug и URL не копируются в JSON. Простая статья может содержать только rich text.

Frontend читает `content_blocks` первым и `content` как fallback. JSON renderer имеет
строгий allowlist и отдельные React-компоненты для relation blocks. Неизвестный или
повреждённый node не приводит к raw HTML execution и не ломает HTML fallback.

### CTA внутри статьи

Pilot сначала проверяет relation block/mark Flexible Editor с target relation и
presentation attributes. Acceptance: target остаётся relation, label/variant не
дублируют URL и title сущности.

Если extension не способен выполнить это условие, допускается узкая коллекция
`article_cta_blocks`:

- `id`;
- `label`;
- `variant` (`primary`, `secondary`, `text`);
- `target_type` (`product`, `category`, `article`, `page`, `external`, `anchor`);
- nullable relations `target_product`, `target_category`, `target_article`,
  `target_page`, из которых заполнено только поле, соответствующее `target_type`;
- validated `external_url` только для `external` и `anchor` только для `anchor`;
- `analytics_key`.

Эта fallback-коллекция создаётся только отдельным release gate после pilot report.

### Product codes

`products.mpn` сохраняется как основной канонический MPN. `product_codes` хранит
множественные дополнительные коды:

- `id`, `product`, `code`, `normalized_code`;
- `code_type`: `oem`, `mpn`, `supplier`, `previous`, `superseded`, `external`,
  `barcode`;
- `source_name`, `source_reference`, `is_active`;
- timestamps.

Уникальность действует на `(product, code_type, normalized_code, source_name)`, а не
глобально: одинаковый внешний код может относиться к нескольким товарам. Collision
report отдельно выявляет неоднозначность для поиска.

### Product analogs

`products_analogs` хранит один edge:

- `product_from`, `product_to`;
- `relation_type`: `analog`, `oem_cross`, `compatible`, `superseded_by`;
- `canonical_key` с unique constraint;
- `source_name`, `note`, `verified_at`, timestamps.

`analog`, `oem_cross`, `compatible` логически симметричны: canonical key строится из
отсортированной пары ID. `superseded_by` направлен и сохраняет from/to. Self edge и
физические зеркальные пары запрещены.

### Normalized search

В `products` появляются скрытые индексированные `sku_normalized` и
`mpn_normalized`. Поиск объединяет их с `product_codes.normalized_code`, выполняется
server-side с pagination и Directus accountability. Запрос `limit=-1` и фильтрация в
Node.js удаляются после подтверждённого cutover.

### SEO work items

`seo_work_items` — очередь и состояние, а не хранилище crawl telemetry. Модель
содержит type/subtype/status, priority/confidence, entity reference, summary,
recommendation, evidence/sources, proposed patch, dedupe key, before/stale hash,
relation к статье и worker timestamps.

Worker сохраняет evidence tiers, claim→source validation, stale-hash и field allowlist.
Он работает disabled/shadow по умолчанию и создаёт только draft. Не переносятся
custom Studio module, отдельная `seo_factory.*` schema, scheduler, Docker/env и
placeholder article content из старой ветки.

## Редакторы и extensions

### Flexible Editor

Pilot проводится на Directus 12.1.1 на disposable/staging-копии. Проверяются schema
footprint, rich-text-only документ, relation blocks/marks, CTA, tables, duplicate,
copy/paste, drag-and-drop, orphan cleanup, API, React rendering, XSS и uninstall.

Production rollout разрешён только при успешном pilot. Directus 12.2 не смешивается с
pilot. Если выбранная версия editor потребует 12.2, сначала выполняется отдельный
upgrade spike на staging-копии БД.

### SEO Plugin

`@directus-labs/seo-plugin@1.1.1` проверяется на отдельном disposable/staging instance.
Production не устанавливается до успешной проверки host mismatch, schema footprint,
API, mapping, UX и uninstall.

Scalar SEO fields не удаляются. При принятии действует JSON-first/scalar-fallback.
Несколько терминов Canonical/Open Graph/Robots допустимы на английском; преимущественно
английский технический UI требует доступной локализации или тонкой русской обвязки.

### Visual Editor

Visual Editor — необязательная вторая фаза после полностью рабочего Live Preview.
Staging PoC оформляется отдельным security scope. Проверяются CSP, frame-ancestors,
X-Frame-Options, CORS, cookies, auth, preview URL, permissions, draft и отсутствие
публичного служебного API. Неуспех PoC не блокирует основную админку.

## Importer/reconciliation

Default update profile существующего товара ограничен:

- `price`;
- `price_status`;
- `availability_status`;
- `delivery_status`;
- `source_name`;
- `source_url`;
- `verified_at`.

Вес относится к отдельному trusted profile. Editorial, category, slug, SEO, media,
applicability, analog и code profiles требуют opt-in и полного preview/diff.

Engine обязан создавать immutable manifest, plan artifact, minimal patches,
before-state, per-record report, idempotency keys, resumable batches, reconciliation и
rollback artifact. Запрещённое поле завершает запись конфликтом. Новые товары по
умолчанию создаются как draft.

Supplier offers, warehouses, multiple prices и purchase price не реализуются в первом
релизе: текущая схема не содержит согласованной модели, а feed contract отсутствует.

## Релизная последовательность

1. Документация архитектурного решения и recoverability tooling.
2. Native Studio UX без смены источника истины.
3. Изолированные editor и SEO plugin spikes.
4. Backup, dependency audit и decommission шести legacy collections.
5. Owner-XOR `page_sections`.
6. Structured article schema, frontend dual-read и cutover трёх статей.
7. `product_codes` и indexed normalized search.
8. Product media/specifications/documents dual-read и миграция.
9. `products_analogs`.
10. Hardened importer/reconciliation engine.
11. `seo_work_items` и worker control plane.
12. SEO production integration после spike.
13. Content Versioning, Live Preview и item-aware revalidation.
14. Отдельный security-scoped publish policy release.
15. Visual Editor staging PoC и, при успехе, отдельный production proposal.
16. Финальная Studio UX и rollout QA.

Новые junction и `seo_work_items` не создаются до production verification legacy
decommission, пока действует Core limit.

## Глобальные критерии качества

- 12 971 товаров сохранены; случайной депубликации нет.
- 283 gallery products и 1 251 file reference полностью reconciled.
- Создано ровно 968 дополнительных gallery rows по согласованному правилу.
- У каждой `page_section` ровно один owner.
- Никакой runtime path не читает весь каталог через `limit=-1` для SKU/OEM поиска.
- Article HTML остаётся рабочим fallback до подтверждённого cutover.
- Importer не изменяет запрещённые поля и не выполняет full-payload PATCH.
- Worker не публикует статьи.
- Metadata, canonical, robots, OG, sitemap и JSON-LD проходят before/after diff.
- Preview не раскрывает Directus token или `data-directus` в обычном public режиме.
- Leads/orders и защищённые области не затрагиваются несвязанными релизами.

## Rollback model

Rollback выбирается по классу релиза:

- metadata-only: импорт сохранённого Studio metadata snapshot;
- additive schema: отключение consumer path, сохранение данных, затем отдельный cleanup;
- data migration: restore before-state по migration batch и reconciliation;
- destructive schema: полный проверенный restore БД/schema/files;
- frontend: возврат consumer к fallback без удаления новой модели;
- extension: raw-field fallback и проверенный uninstall;
- security: восстановление точных headers/policies snapshot.

Rollback считается готовым только после rehearsal на staging, а не после написания
команды.
