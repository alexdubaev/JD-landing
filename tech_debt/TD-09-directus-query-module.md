# TD-09 — Разобрать catalog.ts (987 строк): lib/directus/query.ts + выделение media/analogs/search

- **Приоритет:** P2 (бог-модуль data-слоя: 15 экспортов, 14 копий одного паттерна, 3 дублирования хелперов на весь lib/directus)
- **Усилие:** M (~1 день; чистый рефакторинг без изменения поведения)
- **Тип:** refactor
- **Зависимости:** строго после TD-07 и предпочтительно после TD-08; TD-03 уже мог потрогать search-функции — координировать.

## Симптом и влияние

`frontend/src/lib/directus/catalog.ts` — 987 строк, единственный файл, куда смотрят все каталог-фечи.
Внутри: 11 Raw-типов, мапперы, R7A-медиа dual-read (253–431), R8-аналоги (433–537), поля/хелперы,
15 экспортированных фетчей. Паттерн «queryString → directusRequest(`/items/...`) → map» скопирован
14 раз. Хелперы `queryString`, `FileRelation`, `fileId` продублированы в трёх модулях directus-либы
(catalog/articles/content), причём копия `queryString` в content.ts **семантически отличается**
(`if (value)` отбрасывает falsy, каталоговая — только пустые строки) — мина при унификации.

Эффект долга: каждая новая правка каталог-данных — редактирование бог-файла; риск задеть соседний
R7A/R8-контракт; ревью таких PR'ов нечитаемо.

## Решение (минимальное)

**Шаг 1 — `frontend/src/lib/directus/query.ts` (новый, ~40–60 строк):**

- `queryString(params)` — одна версия. Семантику взять каталоговую (`value !== undefined && value !==
  ""`), затем вручную прогнать случаи из content.ts: все текущие параметры — строки/числа/булевы;
  булев `false` НЕ должен отбрасываться (в каталоге он и не отбрасывается; в content — отбрасывался —
  проверить, есть ли параметр, реально передающий `false`, если нет — унификация безопасна).
- `type FileRelation`, `fileId()`, `relationId()` — переезд сюда.
- `fetchItems<T>(collection, params, { tags, revalidate = 300 })` — обёртка: склейка URL, дефолтный
  `"filter[status][_eq]": "published"` (с opt-out для коллекций без status), вызов `directusRequest`,
  возврат `data` (типизированно, без рантайм-валидации — она stage-2 S-3).

**Шаг 2 — разрезать catalog.ts на 4 модуля, сохранив публичный API:**

- `product-media.ts` — блок 253–431 (R7A dual-read, `hydrateProductMedia`);
- `product-analogs.ts` — блок 433–537 (R8, `fetchProductAnalogs`);
- `search.ts` — `normalizeSku`/`looksLikeSkuQuery`/`resolveNormalizedSkuIds`/suggestions-функции;
- `catalog.ts` — остаётся точкой входа: `export * from "./product-media"` и т.д. + основные фетчи.
  **Ни один потребитель не меняется.**
- Поле-листы (`categoryFields`/`cardFields`/`detailFields`) остаются в catalog.ts; добавить
  `categoryLightFields` (slug/title/isIndexable + id) для лёгких потребителей (llms.txt,
  category-tree) — сейчас им отдаётся тяжёлый набор с `seo_text`.

**Шаг 3 —** articles.ts/content.ts переводятся на импорт из query.ts (удаление их локальных копий
queryString/FileRelation/fileId).

## Подводные камни

1. **Семантика queryString** — главный риск. Прежде чем объединять, выписать все параметры,
   которыми зовутся обе существующие копии (grep `queryString(`), и сверить: ни один вызов не должен начать
   отбрасывать `false`/`0`. Если такой параметр найдётся — оставить унифицированную версию с
   явным исключением.
2. **Тесты мокают `directusRequest` по пути модуля** — `catalog.test.ts` перехватывает клиентский
   модуль; после переезда фетчей в query.ts мок по-прежнему на клиенте (fetchItems зовёт
   `directusRequest` из client.ts) — проверить, что vi.mock остаётся рабочим; при необходимости
   обновить import-пути в тестах, но не переписывать тесты.
3. **Кэш-ключи фечей** зависят от итоговой строки запроса: если унификация queryString меняет
   кодировку хоть на байт — просто инвалидируется кэш (безопасно), но тесты, ассертящие URL, надо
   обновить.
4. R7A/R8/R11 комментарии-контракты переносить как есть — они документируют нетривиальные решения
   (dual-read и т.п.).
5. `export *` из подмодулей может создать конфликт имён (`normalizeSku` и пр.) — проверить
   уникальность до разрезания.
6. НЕ строить generic repository/билдер запросов — обёртка `fetchItems` потолок абстракции.

## Allowed files (ADR-002)

- `frontend/src/lib/directus/query.ts` (новый)
- `frontend/src/lib/directus/catalog.ts` → + `product-media.ts`, `product-analogs.ts`, `search.ts` (новые)
- `frontend/src/lib/directus/articles.ts`, `content.ts` — точечно (импорт хелперов)
- `frontend/src/lib/directus/catalog.test.ts` — перенос/обновление блоков + новые cases для
  `categoryLightFields`
- потребители `categoryLightFields`: `app/llms.txt/route.ts`, `lib/catalog/category-tree.ts` — точечно

## Верификация

1. `npm run typecheck && npm test` — все существующие тесты каталога зелёные без правки ассертов
   (кроме URL-кодировки, см. пункт 3).
2. Diff-аудит: `git diff` не содержит изменений логики — только перемещения и импорты
   (`git diff --stat` + выборочная вычитка).
3. Smoke: каталог, категория, карточка продукта (галерея = R7A), поиск по SKU.

## Не делаем

- Никаких zod-схем на ответы Directus (S-3), никакой смены тегов/revalidate, никакого пагинированного
  репозитория, OData-билдера и пр.
