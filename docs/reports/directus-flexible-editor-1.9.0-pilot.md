# Pilot: directus-extension-flexible-editor@1.9.0 на Directus 12.1.1

Статус: **ACCEPT** (с условиями — лицензия и manual UI QA перед cutover).
Спайк: Task 3 (S1). Disposable staging `http://127.0.0.1:8057`, Directus 12.1.1 fresh + схема проекта.

## Итог gate

**ACCEPT.** Расширение совместимо с Directus 12.1.1, его модель данных **точно совпадает со спецификацией Task 7**, откат безопасен. Fallback-коллекция `article_cta_blocks` **не нужна** — CTA реализуется relation-узлом. Условия принятия (не блокируют schema-add Task 7 R5A, но блокируют production-cutover Task 9):

1. **Лицензия GPL-3.0** — подтвердить с владельцем/юристом допустимость server-side использования (см. раздел License).
2. **Manual UI QA** перед cutover (M2A-sync, drag/drop, copy/paste, orphan-cleanup) — см. раздел Manual QA.

## Артефакт (pin)

| | |
|---|---|
| name | `directus-extension-flexible-editor` |
| version | `1.9.0` |
| license | **GPL-3.0** |
| host | npm registry (registry.npmjs.org) |
| repo | github.com/formfcw/directus-extension-flexible-editor |
| tarball | `…/directus-extension-flexible-editor/-/directus-extension-flexible-editor-1.9.0.tgz` |
| sha1 (verified) | `eae6e0dec5fec55e6d07a1ef48d2cf16cd806820` |
| sha512 (verified) | `gqv7SeE+qx3lPFZkJMjK45ifVmuFSaqD6CFBcCmSrl2Kz83thjQFNN4SoI+QJR7rQygWKVVwiG7sxAL89JqZFg==` |
| directus host req | `^10.0.0 \|\| ^11.0.0 \|\| ^12.0.0` → совместимо с 12.1.1 |
| type | bundle (interface + display), prebuilt `dist/app.js` + `dist/api.js` |

Хеши скачанного tarball совпали с опубликованными (sha1 и sha512 base64).

## Совместимость и загрузка

- Установлен в staging (host-dir `/directus/extensions`, `docker compose restart`).
- `Loaded extensions: directus-extension-flexible-editor` — **без ошибок** при загрузке и при health-check.
- Directus 12.1.1 грузится штатно; collection `articles` доступен.

## Schema footprint (модель данных — совпадает со спекой Task 7)

Расширение не создаёт schema само — оно использует стандартный M2A-pattern, задаваемый в Data Model:

- `articles_editor_nodes` — junction-коллекция, PK = **Generated UUID** (создаётся вручную перед M2A).
- `articles.editor_nodes` — скрытый **M2A-alias** (Hidden on Detail, без interface), Related Collections = нужные (products, categories, …), Relational Triggers = **cascade** on delete/deselect.
- `articles.content_blocks` — nullable **JSON** поле, interface = `flexible-editor`, опция **M2A Reference Field = `editor_nodes`**, Relation Block/Inline Block/Mark → коллекции; **Tools** отключает H1, включает H2–H4/lists/quote/link/table.

Это **ровно** модель Task 7 (`content_blocks` + `editor_nodes` alias + `articles_editor_nodes` junction). Подтверждает, что production-schema Task 7 реализуема этим расширением.

## Формат JSON (для renderer'а Task 8 / F1)

ProseMirror-документ. Хранится в `articles.content_blocks`.

- Узлы: `doc`, `paragraph`, `text`, `heading` (attrs.level; H1 отключён tools), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `table`, `tableRow`, `tableHeader`, `tableCell`, `hardBreak`.
- Relation-узлы: `relationBlock`, `relationInlineBlock` (nodes), `relationMark` (mark поверх text). Attrs = `{ id, junction, collection }` — **только ссылка** на junction-запись; title/price/slug/URL в JSON **не попадают** (резолвятся из реальной сущности на фронте).
- Marks: `bold`, `italic`, `strike`, `underline`, `code`, `subscript`, `superscript`, `link` (attrs.href), `textAlign` (attrs.align), `relationMark`.

Fixture-примеры (контракт `rich text → product → CTA → category → table → rich text`) — в `directus/spikes/flexible-editor/article-fixtures.json`. Renderer F1 уже реализует этот allowlist + injectable resolver; имена relation-типов подтверждены из собранного бандла.

## CTA

CTA = `relationMark` или `relationBlock`, ссылающийся на product/category. Target остаётся **relation**; label/variant — это presentation-данные фронтенда (берутся из сущности или из контекста), в JSON не дублируются. Условие спецификации выполнено → **fallback `article_cta_blocks` не требуется**.

## Security

JSON структурный (не raw HTML). Автоматизированный verifier (`verify-pilot.mjs`, **5/5 тестов**) доказывает контракт безопасности:
- strict allowlist node/mark-типов → `script`-узлы отклоняются;
- `javascript:` / `data:` / `vbscript:` / `file:` href в `link`-mark отклоняются;
- event-handler attrs (`on*`) отклоняются;
- relation-узлы не несут лишних атрибутов (no snapshot-leak).

Raw-HTML execution surface в JSON отсутствует — при условии, что фронтенд-рендерер использует strict allowlist (F1 это делает). `generateHTML()` напрямую применять НЕ рекомендуется (использовать structured renderer).

## Uninstall / rollback (безопасен)

- Удаление расширения + `restart` → Directus 12.1.1 **загружается без ошибок**, `ping` 200, `/items/articles` 200.
- Схема не ломается: `content_blocks` остаётся обычным JSON-полем (данные сохранены), interface fallback на default JSON. `articles.content` (HTML) остаётся каноном до cutover Task 9.
- Rollback Task 7: отключить interface → raw JSON fallback; HTML остаётся рабочим.

## License (флаг)

**GPL-3.0.** Directus core 12.x сам по себе BSL/GPL-family. Расширение работает server-side внутри hosted Directus; GPL-3.0 (не AGPL) не триггерит copyleft при SaaS-использовании без дистрибуции. **Рекомендуется подтверждение владельцем/юристом**, что это укладывается в лицензионную модель проекта. Не блокирует schema-add (Task 7 R5A).

## Автоматизированный verifier

`directus/spikes/flexible-editor/verify-pilot.mjs` (+ `.test.mjs`): 5/5 pass. Покрывает: структуру ProseMirror, relation-контракт `{id,junction,collection}` без snapshot, rich-text-only без relation-узлов, security-corpus (script/js-link/data-link/event-handler — все rejected), обработку некорректного корня.

## Manual QA (UI-only, обязателен перед production-cutover Task 9)

Не автоматизируется API в рамках спайка — требует браузерного прогона в staging после Task 7 R5A:
- функциональный M2A-sync: save статьи с relation-узлом → junction-запись создаётся/синхронизируется, удаление узла → orphan cleanup;
- drag/drop, copy/paste, duplicate (требует Item Duplication Fields на junction);
- undo/redo;
- permission-denied relation (роль без доступа к target-коллекции);
- опция Tools реально отключает H1 и включает нужные узлы;
- производительность на длинных документах.

## Связанные файлы спайка

```
directus/spikes/flexible-editor/article-fixtures.json
directus/spikes/flexible-editor/verify-pilot.mjs
directus/spikes/flexible-editor/verify-pilot.test.mjs
docs/reports/directus-flexible-editor-1.9.0-pilot.md   (этот отчёт)
```

## Решение для плана

`ACCEPT`. Разрешает **Task 7 R5A** (production article editor schema, additive) иrenderer Task 8/F1 (формат подтверждён). Production-cutover (Task 9) — после license-review и manual UI QA. `article_cta_blocks` не создаётся.
