# TD-07 — Вычистка мёртвого кода (чистые удаления, нулевой риск поведения)

- **Приоритет:** P2 (снижает шум и площадь поддержки; все правки — удаления)
- **Усилие:** S (~2–3 ч, в основном grep-верификация)
- **Тип:** refactor (deletion-only)
- **Зависимости:** нет. Делать ДО TD-08/09, чтобы не дедуплицировать мёртвый код.

## Симптом и влияние

В проекте живёт слой никем не импортируемого кода: компоненты из шаблона vibe, «параллельные»
версии секций, экспорты «на будущее», копия 404-страницы. Каждый такой файл — ложная цель для
будущих правок и тестов (тесты уже тестируют невидимый пользователю код — см. TD-14 про аналоги).
Плюс два конфигурационных вранья: CSP `report-uri` на несуществующий роут и запись о несуществующем
маршруте в allowlist прокси.

## Доказательство (всё проверено grep'ом на момент составления; перед удалением перепроверить)

| Что | Где | Доказательство мёртвости |
|---|---|---|
| Дубль 404-страницы | `frontend/src/app/_seo-not-found/page.tsx` | private-папка App Router (`_`-префикс) — маршрут не существует; упоминание только в `proxy.ts:11` |
| Кнопка из шаблона | `frontend/src/components/ui/Button.tsx` | `Button`/`ButtonLink` — ноль импортёров (все кнопки — сырые `<button className="button">`) |
| Секция преимуществ | `frontend/src/components/sections/HomeBenefits.tsx` | ноль импортёров (advantages рендерятся внутри HomeHero) |
| Неиспользуемые экспорты | `HomeContentSections.tsx`: `HomeSeoText` (33–53), `HomeLeadForm` (122–140) | импортируются только `HomeFaq`, `HomeCta`, `HomeContacts` |
| Мotion-примитив | `frontend/src/components/motion/Stagger.tsx` | импортёр — только `MotionPrimitives.test.tsx` |
| Мёртвые пропсы | `Reveal.tsx:12–13` — `delay`/`distance` объявлены, не используются | после перевода motion на static |
| Дивергенция дисклеймера | `lib/brand.ts:5–6` `BRAND_DISCLAIMER` — ноль импортёров; Footer берёт текст из CMS (`footerDisclaimer`) с инлайн-фолбэком, который уже отличается от константы | неиспользуемая константа-двойник живого текста |
| Мёртвые типы | `types/directus.ts`: `DirectusId`, `PublicationStatus`, `DirectusListEnvelope` | ноль ссылок вне файла |
| CSP на пустоту | `next.config.ts:28` — `report-uri /api/csp-report` | роута `api/csp-report` не существует — репорты уходят в 404 |
| Фантом в allowlist | `proxy.ts:11` — `"_seo-not-found"` | маршрут не существует (см. выше) |
| Мёртвые экспорты корзины | `lib/cart/context.tsx:243–244` — `CART_STORAGE_KEY`, `CART_CHANGE_EVENT` | ноль внешних импортёров. `isPurchasable` НЕ трогать — понадобится в TD-08 |

## Решение (минимальное)

1. Удалить файлы: `_seo-not-found/page.tsx`, `ui/Button.tsx`, `sections/HomeBenefits.tsx`,
   `motion/Stagger.tsx`.
2. Удалить экспорты `HomeSeoText`/`HomeLeadForm` из `HomeContentSections.tsx` (и их упоминания из
   теста, если есть).
3. Удалить мёртвые пропсы `delay`/`distance` из `Reveal.tsx` (тип + docstring), убрать их из
   story/тест-пропсов, если встречаются.
4. Дисклеймер: принять живой текст Footer как источник правды → удалить `BRAND_DISCLAIMER` из
   `lib/brand.ts`. (Альтернатива — наоборот — требует правки текста на сайте; не наш путь.)
5. Удалить три мёртвых типа из `types/directus.ts`.
6. `next.config.ts`: удалить директиву `report-uri` (роута нет; завести роут — stage-2, если
   понадобится CSP-отчётинг).
7. `proxy.ts`: удалить `"_seo-not-found"` из `knownTopLevelPaths`.
8. Удалить `CART_STORAGE_KEY`/`CART_CHANGE_EVENT` экспорты (значения остаются внутри модуля).

## Подводные камни

1. **Перепроверить каждый пункт grep'ом прямо перед удалением** — код мог получить импортёра после
   составления этой задачи: `grep -r "<имя>" frontend/src --include="*.ts*" | grep -v test`.
2. Порядок с TD-02: обе задачи трогают `lib/cart/context.tsx`. TD-02 (P1) идёт первой; её тесты
   смогут использовать `CART_STORAGE_KEY`/`CART_CHANGE_EVENT` до того, как эта задача их удалит —
   после TD-02 тесты должны ссылаться на литералы значений (или тест TD-02 обновить вместе с
   удалением экспортов).
3. `MotionPrimitives.test.tsx` упадёт после удаления Stagger — вырезать его блок из теста, не
   оставлять закомментированным.
4. `HomeContentSections.test.tsx` (если есть) может рендерить удаляемые экспорты — обновить.
5. Удаление `report-uri` меняет строку CSP → обновить тест, который матчит CSP (если есть; искать
   по `report-uri` в `*.test.*`).
6. НЕ удалять `getHeaderNavigation` (экспорт только ради теста) — это осознанный компромисс,
   трогать не будем (анти-скоуп).

## Allowed files (ADR-002)

- только перечисленные выше файлы frontend + их тесты.

## Верификация

1. `npm run typecheck && npm run lint && npm test` во frontend.
2. `grep -r "HomeBenefits\|Stagger\|BRAND_DISCLAIMER\|_seo-not-found" frontend/src` — пусто.
3. Ручной smoke: главная, каталог, 404-страница (`/nope`) рендерятся.

## Не делаем

- Не трогаем аналоги (`RelatedProducts.analogs`) — это TD-14, там решение «включить или похоронить».
- Не трогаем SEO-доки и скрипты — TD-17/18.
