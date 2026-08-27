# TD-06 — Реvalidация: вебхук не знает про faq_items и directus_files (контент застревает)

- **Приоритет:** P1 (правка FAQ или замена файла в CMS не обновляет сайт; вебхук для FAQ вообще отвечает 400)
- **Усилие:** S (~2–4 ч с тестами)
- **Тип:** bug
- **Зависимости:** нет.

## Симптом и влияние

Контент-менеджер правит FAQ в Directus → webhook `POST /api/revalidate` с `collection: "faq_items"`
получает **400 "Collection is not allowed"** → FAQ на сайте остаётся старым до истечения ISR-окна
(300с) — а при `force-dynamic` главной — пока не истекут теги/кэш. Аналогично замена файла
(логотип/картинка) в `directus_files` не сбрасывает теги `"files"` и `file:${id}` — метаданные
освежаются через 300с, а CDN-байты (`media/[fileId]`, `stale-while-revalidate=86400`) — до суток.

## Доказательство (file:line)

1. `frontend/src/lib/directus/content.ts:415` — феч FAQ использует тег `"faq"`.
   `frontend/src/app/api/revalidate/route.ts:6–26` — `collectionTags` **не содержит** ключа
   `faq_items` → ветка «Collection is not allowed» отвечает 400.
2. `frontend/src/lib/directus/catalog.ts:933` — `getFilesByIds` вешает тег `"files"`;
   `frontend/src/app/media/[fileId]/route.ts:37,52,113,135` — теги `file:${id}`,
   `section-image:${id}`, `asset:${id}`. Ни один fetch не инвалидируется: в `collectionTags` нет
   `directus_files`.
3. `revalidate/route.ts:21` — `orders: ["orders"]`: тег `"orders"` не использует ни один fetch
   (orders — write-only `no-store`) — мёртвая строка конфига.
4. Обратная сторона: `revalidate/route.ts` умеет item-aware инвалидацию (по id) — для файлов это
   как раз нужно (`revalidateTag("file:" + id)`).

## Решение (минимальное)

В `collectionTags` (`revalidate/route.ts`):

```ts
faq_items: ["faq", "homepage"],
directus_files: ["files"],
```

- `faq_items` тянет `homepage`, т.к. FAQ-секция рендерится на главной (проверить фактические теги
  фечей главной; если FAQ на главной фетчится под тегом `faq` только — оставить `["faq"]`).
- `directus_files: ["files"]`. Item-aware инвалидация в этом роуте устроена как
  `resolveItemPaths` → `revalidatePath` (не «revalidateTag по id»); пер-файловые теги
  (`file:${id}` и др.) сбрасываются либо через существующий теговый канал (`body.tags`), либо
  минимальным расширением item-ветки для `directus_files` — свериться с фактической реализацией
  роута при выполнении и выбрать существующий механизм, ничего не изобретая.
- **Обязательно (не опционально):** расширить `REVALIDATION_COLLECTIONS` в
  `directus/flows/apply-revalidation-flow.mjs:4–14` — список **не содержит** `directus_files`,
  значит флоу никогда не пошлёт вебхук для файлов, и правка одного роута ничего не починит.
  Для `faq_items` — проверить, что флоу его уже шлёт (на момент ревью — да).
- Удалить строку `orders` (и её ожидания в тестах).
- Обновить `revalidate/route.test.ts`: кейсы для `faq_items` и `directus_files` (успех + item-id),
  удаление orders-кейса.

## Подводные камни

1. **Имя коллекции в вебхуке.** Управляемый Flow на стороне Directus
   (`directus/flows/apply-revalidation-flow.mjs`) фильтрует коллекции списком
   `REVALIDATION_COLLECTIONS` (:4–14) — для `faq_items` он уже шлёт вебхук, для `directus_files` —
   нет. Поэтому правка флоу — обязательная половина фикса (см. решение), не «проверить при
   выполнении». Зона `directus/flows/` чувствительна по ADR-002 — правка минимальная: одно
   добавление в массив списка.
2. **Частота событий directus_files** выше контентных (загрузка ассетов пачкой) — каждая инвалидирует
   теги `files`/`file:id`. Это дёшево (реvalidация ленивись в Next), но убедиться, что не
   revalidatePath всей главной на каждый файл — mapping трогает только теги, не пути: ок.
3. `sitemap`-тег не трогаем для files (файлы не в sitemap).
4. Не забыть snake_case/camelCase дубль ключей — в маппинге уже есть пары
   (`page-sections`/`page_sections`) — добавить обе формы для новых ключей при необходимости
   (faq_items пишется слитно в обеих формах — просто один ключ).

## Allowed files (ADR-002)

- `frontend/src/app/api/revalidate/route.ts` (+ `route.test.ts`)
- `directus/flows/apply-revalidation-flow.mjs` (+ его тест) — **обязательная часть фикса**
  (добавление `directus_files` в `REVALIDATION_COLLECTIONS`).

## Верификация

1. `npm test` во frontend (обновлённые кейсы).
2. Локально с секретом: `curl -X POST localhost:3000/api/revalidate -H "x-revalidate-secret: …" -d
   '{"collection":"faq_items"}'` → `{"ok":true}`; тот же запрос для `directus_files` с `id`.
3. E2E-проверка в согласованном окне: правка FAQ-айтема в Directus → на сайте ответ 200 с новым
   текстом (после реvalidации), в логах вебхука нет 400.

## Не делаем

- Не перестраиваем маппинг тегов на схему «тег из феча автоматически», не добавляем реvalidацию
  путей для файлов, не трогаем IndexNow-механику (отдельно — TD-13).
