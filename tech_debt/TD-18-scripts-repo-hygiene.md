# TD-18 — Скрипты импорта: дубли, латентный regex-баг, одноразовые тейки + гигиена репо

- **Приоритет:** P3 (инструмент запускается редко, но по живому прод-Directus; и репо несёт мусорные сущности)
- **Усилие:** M (~0,5–1 день)
- **Тип:** refactor / hygiene
- **Зависимости:** нет.

## Симптом и влияние

### a) Копипаст в scripts/
- CSV-парсер продублирован дословно: `scripts/build-directus-products-csv.mjs:47–90` vs
  `scripts/import-directus-products-csv.mjs:27–63`; `toRecords/readRecords` почти идентичны.
- Env-парсер ×3: `build:114–124`, `sync-deere-shop-brand.mjs:3–11`, `upload-deere-shop-logo.mjs:3–11`.
- 29-полевая схема продукта ведётся дважды: `directusFields` (build:15–45 + маппинг :164–194) и
  `productPayload` (import:106–138) — новое поле молча теряется при импорте.
- Разрешение категорий и дедупликация SKU дублированы между build/import.

### b) Латентный баг в regex
- `build-directus-products-csv.mjs:219` — regex `/(?:\\.\\.\\.|…)$/u`: альтернатива `…` работает
  (в реальном датасете 28 описаний кончаются на `…` и ловятся), а вот ветка `\\.\\.\\.` матчит
  «бэкслеш+любой символ» ×3 вместо ASCII-`...` — ASCII-многоточие никогда не ловится. Валидация
  наполовину живая, не «мёртвая»; статус — латентный баг, чинить одной строкой, только если скрипт
  остаётся живым (см. решение).
- `build:5–8` — вход захардкожен в `outputs/deere-supplier-import-2026-08-12/...` — папка **не в
  git**: свежий клон не может запустить скрипт.
- BOM: build пишет `\uFEFF` (:244), import его защищно срезает (:67) — convention'ы разъехались.

### c) Одноразовые скрипты с хардкодом
- `sync-deere-shop-brand.mjs` / `upload-deere-shop-logo.mjs`: `http://localhost:8055`, хардкод
  UUID'ов строк/папок, инлайн маркетинговых текстов, `loginResponse.ok` не проверяется
  (падает с невнятным 401) — классические one-off'ы, задача которых выполнена.

### d) Гигиена репо
- `directus/create-frontend-token.mjs:18` — токен Frontend API = `"jd-frontend-static-token-" +
  Date.now()` — переборный/предсказуемый; рядом правильный образец
  `seo-worker/scripts/create-token.mjs:21` (`randomBytes(32).toString("hex")`).
- `.gitignore:34–35` (`outputs/`) и (`docs/superpowers/`) игнорируют каталоги, **содержимое
  которых уже затрекано** (1257 файлов под outputs/, 20 под docs/superpowers/plans/) — новые файлы
  туда молча не попадают в git, старые продолжают синхронизироваться. Худший из двух миров.
- `outputs/deere-supplier-import-2026-08-12/node_modules/` — мусор внутри каталога данных.
- Три поколения импорт-пайплайнов без маркировки: `directus/import/products.mjs` (299-продуктовый
  запуск), `directus/importer/` (новый Task-13/R9), `scripts/import-directus-products-csv.mjs`.
- `seo-worker/package.json:12–13` — check/build перечисляют файлы вручную: новый .mjs молча
  не проверяется.

## Решение (минимальное)

1. **Решение о судьбе пайплайна** (вопрос владельцу в PR): актуальный — `directus/importer/`
   (field-level, rollback, тесты). Если подтверждается — корневые `build-/import-directus-products-csv.mjs`
   пометить как superseded: перенести в `scripts/archive/` с README-строкой «замещён
   directus/importer, запускать только по явному решению» — **без правок внутри архива**
   (латентный regex-баг чинить нечего: скрипт архивный). Если скрипты ещё нужны «живыми» — тогда
   вынести `scripts/lib/` (csv/env/fields), убрать дубли и починить regex
   (`/(?:\.\.\.|…)$/u`) одной строкой.
2. `sync-deere-shop-brand.mjs`, `upload-deere-shop-logo.mjs` → `scripts/archive/` (выполненные one-off).
3. `create-frontend-token.mjs`: `randomBytes(32).toString("hex")` по образцу seo-worker.
4. gitignore-расхождение: **согласовать с владельцем** один из вариантов —
   (а) `git rm -r --cached outputs/jd-product-import-2026-07-28` (+zip) — данные одноразового
   импорта уходят из git в хранилище (LFS-указатели уже есть, история сохраняется);
   (б) убрать строки игнора, если каталоги нужны в git. Для `docs/superpowers/plans/` — просто
   убрать игнор (файлы уже затреканы, это планы в docs).
   Удалить `outputs/deere-supplier-import-2026-08-12/node_modules` локально.
5. `directus/import/products.mjs` → заголовок-комментарий «superseded by directus/importer» (или
   `directus/importer/legacy/` — по вкусу, дешевле комментарий).
6. seo-worker `check` — glob вместо перечня (или оставить, если TD-05 уже решил).

## Подводные камни

1. `git rm -r --cached` больших каталогов меняет чекаут у коллабораторов и раздувает PR — отдельный
   коммит `chore: untrack one-off import artifacts`, не смешивать с кодом.
2. Архивация скриптов ломает muscle-memory владельца (`node scripts/upload-...`) — согласовать
   названия/перемещение до PR; в архиве оставить шапку «откуда и почему».
3. LFS: `outputs/**` на LFS-указателях; rm --cached не трогает историю — объекты останутся
   доступными по старым коммитам (проверить `git lfs ls-files` до/после).
4. Токен-скрипт: после генерации новым токеном старый токен роли Frontend API продолжает работать —
   ротация отдельное действие в Directus (владелец), в задаче только генерация.
5. Ничего не удалять из `directus/importer/` — это живой инструмент.

## Allowed files (ADR-002)

- `scripts/**` (включая новые `scripts/archive/**`, `scripts/lib/**` — по выбранному варианту)
- `directus/create-frontend-token.mjs`
- `.gitignore`, `directus/import/products.mjs` (шапка), `seo-worker/package.json` (если не сделано в TD-05)
- git-индекс: untrack `outputs/...`/`commit-push.bat` — отдельным коммитом после явного «да» владельца.

## Верификация

1. `node --test scripts/` (validate-import) + `node --check` всех перемещённых скриптов.
2. `git check-ignore outputs/...` и `git ls-files outputs/` — согласованное состояние
   (игнор ⇔ незатрекано).
3. Grep-аудит: никто не ссылается на перемещённые пути (docs/DEPLOY/AGENTS).

## Не делаем

- Не переписываем импортер на TypeScript, не строим единый CLI «import-tools», не выносим outputs
  в S3-скриптами (это stage-2 S-10).
