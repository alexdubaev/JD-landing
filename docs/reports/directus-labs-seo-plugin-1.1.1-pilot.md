# Pilot: @directus-labs/seo-plugin@1.1.1 на Directus 12.1.1

Статус: **ACCEPT (условный)** — принять только после browser UX QA; scalar SEO-поля остаются каноническим fallback независимо от решения.
Спайк: Task 4 (S2). Disposable staging `http://127.0.0.1:8057`, Directus 12.1.1 fresh + схема проекта, **без** Flexible Editor.

## Итог gate

**ACCEPT (условный).** Плагин загружается и регистрируется на Directus 12.1.1, uninstall безопасен, лицензия MIT. Объявленный `host: ^10.10.0` формально не включает 12.x, но плагин грузится без ошибок (поле `host`, вероятно, устаревшее — зависимости современные: extensions-sdk 13, vue-i18n 10, reka-ui 2). **Условие приёма:** browser-based UX QA до production-внедрения (Task 15). Scalar SEO-поля проекта (`seo_title`, `seo_description`, `canonical_url`, OG, indexability) **остаются** каноническим fallback и не удаляются.

## Артефакт (pin)

| | |
|---|---|
| name | `@directus-labs/seo-plugin` |
| version | `1.1.1` |
| license | **MIT** |
| host | npm registry (registry.npmjs.org) |
| repo | github.com/directus-labs/extensions (packages/seo-plugin) |
| tarball | `…/@directus-labs/seo-plugin/-/seo-plugin-1.1.1.tgz` |
| sha1 (verified) | `a95c4415fe90730b70c4a53faacab1c85838c8fc` |
| sha512 (verified) | `KdjC/tSmi6cQvpCQM3ILBUH/EOh+X3fCB77PYapJci8LN0ixZyE7idnEDYwJMnjgw9+rIxderCldOHibDcbhQg==` |
| declared host | `^10.10.0` (Directus 10.x) — **см. Host mismatch** |
| type | bundle (interface `seo-interface` + display `seo-display`), prebuilt `dist/app.js` + `dist/api.js` |

Хеши скачанного tarball совпали с опубликованными (sha1 и sha512 base64).

## Совместимость и загрузка

- Установлен в staging (host-dir `/directus/extensions`, `docker compose restart`).
- `Loaded extensions: @directus-labs/seo-plugin` — **без ошибок** при загрузке и health-check.
- Directus 12.1.1 **не отказал** в загрузке несмотря на `host: ^10.10.0`.

## Функциональность (API-level)

- Создание JSON-поля с `interface: "seo-interface"` на `articles` → **200** (интерфейс зарегистрирован и принимается), read-back → 200, удаление → ok.
- Это подтверждает регистрацию интерфейса и работу на уровне поля. Полный UX (рендер формы, OG-image picker, авто-генерация meta, preview) — **browser-only**, в рамках API-спайка не валидировался.

## Host mismatch (главный риск)

- Манифест плагина объявляет `directus:extension.host: "^10.10.0"`, что в semver = `>=10.10.0 <11.0.0` — **только Directus 10.x**.
- Мы работает на **12.1.1**. Формально — unsupported-конфигурация.
- При этом: загрузка без ошибок, интерфейс регистрируется. Зависимости сборки современные (extensions-sdk 13.0.1, vue-i18n ^10, reka-ui ^2) — указывают, что плагин реально собран под новый Directus, а поле `host` просто не обновлено.
- **Риск:** runtime-поведение UI на 12.1.1 не подтверждено без browser-прогона; возможны тонкие баги рендеринга/совместимости.

## Uninstall / rollback (безопасен)

- Удаление плагина + `restart` → Directus 12.1.1 **загружается без ошибок**, `ping` 200.
- Поле `seo-interface` (если осталось) fallback на default JSON-интерфейс; данные сохранены. Schema не ломается.
- Scalar SEO-поля проекта не затрагиваются.

## Security

JSON-interface (как и Flexible Editor) хранит структурированные данные; scalar SEO-поля остаются отдельными. При JSON-first/scalar-fallback (Task 15) frontend-резолвер должен валидировать JSON и fallback'ать на scalar при отсутствии/повреждении. OG-image — это relation на `directus_files` (не inline-данные).

## Manual QA (browser-only, обязательно до production Task 15)

- рендер формы `seo-interface` на 12.1.1 (нет ли JS-ошибок в консоли);
- file picker для OG-image;
- авто-генерация meta (title/description из контента) и preview;
- list display (`seo-display`);
- RU/EN UX (плагин использует vue-i18n; оценить долю английского — plan reject'ит «преимущественно английский технический UX»);
- export/import поля;
- API output JSON-поля при сохранении.

## Лицензия

**MIT** — никаких copyleft-ограничений (в отличие от GPL-3.0 у Flexible Editor). Совместимо с коммерческим проектом.

## Решение для плана

`ACCEPT (условный)`. Разрешает **Task 15** идти по **plugin-accepted ветви** (JSON-first/scalar-fallback + addon JSON-поле на home/pages/categories/products/articles) — **но только после** browser UX QA и принятия командой риска host-mismatch. Scalar-поля не удаляются. Если browser QA выявит проблемы — переключаемся на **plugin-rejected ветвь** (только scalar-поля + native Studio groups, без плагина), что план тоже явно разрешает.

## Связанные файлы спайка

```
directus/spikes/seo-plugin/verify-pilot.mjs
directus/spikes/seo-plugin/verify-pilot.test.mjs
docs/reports/directus-labs-seo-plugin-1.1.1-pilot.md   (этот отчёт)
```
