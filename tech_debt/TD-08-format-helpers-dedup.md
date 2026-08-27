# TD-08 — Дедупликация формат-хелперов (цена, наличие, телефон, даты, UTM, чипы фильтров)

- **Приоритет:** P2 (чистое дублирование: 3–6 копий одних и тех же строк/проверок; задача устраняет копии до того, как они разъедутся)
- **Усилие:** M (~0,5–1 день механики + тесты)
- **Тип:** refactor + tests
- **Зависимости:** после TD-07 (не дедуплицируем мёртвое).

## Симптом и влияние

Одни и те же правила отображения реализованы в 2–6 местах независимо (копии на сегодня байт-в-байт
совпадают — это чистое дублирование, задача про устранение копий, а не «фикс дрейфа»). Любая правка
(поменять текст «Цена по запросу», подпись наличия, формат телефона) требует найти все копии, и
каждая новая копия — потенциальный будущий дрейф. Конкретика (все строки — на момент составления):

1. **Цена — 3 копии:** каноничная `formatPrice` в `lib/format/price.ts:8–18` (импортирует только
   CartView) + локальные в `ProductCard.tsx:28–39` и `ProductDetail.tsx:15–25` — одинаковый
   `Intl.NumberFormat` и одинаковые цепочки фолбэков (`on_request` → «Цена по запросу»,
   отсутствие цены → «Уточнить условия»).
2. **«Покупабельность» — 3 копии одной проверки:** `isPurchasable` в `lib/cart/context.tsx:61–63`
   (`priceStatus === "fixed" && typeof price === "number"`) — экспортирован, никем не используется;
   `ProductCard.tsx:60` и `AddToCartButton.tsx:19–21` пишут то же условие по-своему
   (`price != null` / `typeof … === "number"`). Сегодня семантики эквивалентны (цена из CMS либо
   число, либо null); дедупликация — гигиена против будущего расхождения, не фикс бага.
3. **Метки наличия — 3–4 копии:** `availabilityLabels` в `ProductCard.tsx:19–26` и
   `ProductDetail.tsx:9–13`; те же строки захардкожены в опциях фильтра и в чипах активных фильтров
   `CatalogControls.tsx:72–76, 117–146` — т.е. русские подписи фильтров дублированы внутри одного
   файла дважды.
4. **Телефон → href — 6 копий:** `phone.replace(/[^\d+]/gu, "")` в Header, MobileNavigation, Footer,
   HomeHero, HomeContactHub, HomeContentSections.
5. **RU-дата — 3 варианта:** `ArticleCard.tsx:11–15` ≈ `articles/[slug]/page.tsx:23–27` +
   свой формат в `ProductVerification.tsx:8–13`.
6. **UTM-сбор — 3 копии:** идентичный блок чтения 5 utm-параметров в `LeadForm.tsx:40–44`,
   `CheckoutForm.tsx:36–40`, `BulkPartsRequest.tsx:145–154`.
7. **`NavigationItem` — 2 определения:** `components/layout/types.ts:1–4` vs `types/content.ts:3–7`.
8. **`QUANTITY_MAX`**: константа в `context.tsx:16`, а `AddToCartButton.tsx:56` хардкодит свой `10_000`.
9. *(опционально, по желанию владельца)* **Хлебные крошки строятся параллельно** (schema-массив и
   UI-массив из одних данных): category `page.tsx:110–118`/`:131–140`, product `:92–107`/`:122–135`,
   article `:98–102`/`:135–141`. Общего хелпера нет; риск рассинхрона умеренный.

## Решение (минимальное)

1. `lib/format/price.ts`: добавить `formatProductPrice(product: {price, priceStatus})` — обёртка над
   `formatPrice` с существующей цепочкой фолбэков, **без параметров-опций** (текущие тексты в Card и
   Detail байт-в-байт одинаковы — параметризация сама стала бы источником дрейфа). Удалить локальные
   копии из ProductCard/ProductDetail.
2. `lib/format/catalog-labels.ts` (новый, ~30 строк): `AVAILABILITY_LABELS` (map status→RU) +
   `FILTER_OPTIONS` (value→label для селектов CatalogControls) — селекты и билдер чипов едят из
   одного источника. Используют ProductCard/ProductDetail/CatalogControls.
3. `isPurchasable` из cart-контекста становится единственной проверкой: импортировать в ProductCard
   и AddToCartButton, убрать локальные. Поведение не меняется (семантики эквивалентны) — правка
   чисто гигиеническая.
4. `lib/format/tel.ts` (или в `brand.ts`): `telHref(phone)`. Заменить 6 копий.
5. `lib/format/date.ts`: `formatRuDate(iso)` (+ при необходимости вариант с временем для
   ProductVerification — параметром).
6. `lib/analytics.ts`: `collectUtmAttribution(): Record<string, string>` — заменить 3 блока.
7. `types/content.ts`: переиспользовать один `NavigationItem` (экспорт из `types/content.ts`,
   импорт в `components/layout/types.ts`, либо re-export).
8. `AddToCartButton`: импортировать `QUANTITY_MAX` (экспортировать из context.tsx).
9. *(опционально)* Крошки: на трёх страницах строить один массив `{label, href}[]`, из него — и UI,
   и schema (`href → absoluteUrl`). Помощник `breadcrumbsToSchema()` в `lib/seo/schema.ts`.
   Если владелец не видит ценности — пропустить без ущерба остальному.
10. Каждый хелпер — микро-тест (тексты, фолбэки, edge: null/NaN/пустой phone).

## Подводные камни

1. **Байт-в-байт сохранение пользовательских строк** — тесты и SEO завязаны на «Цена по запросу» и
   пр. Не «улучшать» тексты попутно и не добавлять параметры для их вариаций.
2. `isPurchasable` не меняет видимость кнопок (семантики эквивалентны при текущих типах) —
   если после правки какая-то карточка изменила поведение, значит копии уже разошлись на живых
   данных — разобрать этот случай отдельно, не подгонять ассерт.
3. `CatalogControls` — клиентский компонент; новые модули label'ов должны остаться безопасными для
   client-бандла (чистые функции — ок).
4. UTM-хелпер возвращает только непустые значения — семантика «form.set только если есть» должна
   сохраниться (не слать пустые utm-поля).
5. Тесты компонентов после правки обновлять точечно (моки импортов не менять глобально).

## Allowed files (ADR-002)

- `frontend/src/lib/format/**` (+тесты), `frontend/src/lib/analytics.ts` (+тест)
- `frontend/src/components/catalog/ProductCard.tsx|ProductDetail.tsx|CatalogControls.tsx|AddToCartButton.tsx` (+тесты)
- `frontend/src/components/layout/{Header,MobileNavigation,Footer}.tsx`, `sections/Home*.tsx` — точечно telHref
- `frontend/src/components/articles/ArticleCard.tsx`, `app/articles/[slug]/page.tsx`, `components/catalog/ProductVerification.tsx`
- `frontend/src/components/layout/types.ts`, `frontend/src/types/content.ts`
- `frontend/src/lib/seo/schema.ts` (+тест), три страницы с крошками (category/product/article page.tsx + их тесты)

## Верификация

1. `npm run typecheck && npm run lint && npm test`.
2. Визуальный smoke: карточка (все 3 статуса цены), детальная, фильтры+чипы, тел-ссылки в хедере/футере.

## Не делаем

- Не вводим «дизайн-систему»/i18n-фреймворк — это плоские чистые функции.
- Не объединяем формы целиком (это TD-10), не трогаем разметку полей форм.
