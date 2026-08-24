# Технический SEO-пакет DEERE-SHOP: спецификация

Дата: 2026-08-23

Статус: утверждённая концепция, ожидает просмотра перед implementation plan

## 1. Цель

Закрыть технические отличия, выявленные при сравнении DEERE-SHOP с cat-part.ru:

- убрать корзину из поискового индекса;
- сделать OG/Twitter-метаданные page-specific;
- дополнить Article JSON-LD достоверными автором и рецензентом;
- задействовать существующую иерархию `categories.parent` в навигации;
- начать выводить SEO-текст категории из Directus;
- корректно подключать Яндекс Метрику после согласия на аналитику;
- сделать `llms.txt` обнаруживаемым из `<head>`;
- уменьшить необязательную клиентскую гидрацию и вес HTML/JS без потери функций.

Работа должна сохранить текущие канонические URL товаров, категорий и статей, существующий сценарий заявки, корзину и загрузку Excel/фото.

## 2. Scope

Разрешённые области:

- `frontend/src/app` — metadata, robots, sitemap, llms, catalog/article/cart routes;
- `frontend/src/components` — только компоненты дерева категорий и аналитики, если текущая реализация требует изменения границ клиента;
- `frontend/src/lib/seo` и связанные Directus read-мappers — metadata/schema/category rendering;
- `frontend/src/lib/catalog` — только чтение и построение дерева категорий без изменения товарной модели;
- тесты для изменённых маршрутов, schema, metadata, analytics и category tree;
- этот design/spec и последующий implementation plan.

Защищённые области:

- Directus schema, роли, permissions и secrets;
- реальные товары, цены, категории и связи в Directus;
- обработка лидов, уведомления и формы;
- `deploy/`, Docker, Caddy, VPS и production configuration;
- зависимости и инфраструктура;
- существующие URL и поведение checkout/request flow.

Если для включения Метрики в Directus не будет заполнен `yandex_metrica_id`, код не будет подставлять выдуманный номер счётчика. В handoff будет указано конкретное поле, которое нужно заполнить владельцу.

## 3. Текущий baseline

Публичная проверка показала:

- `/cart` отвечает `200`, имеет canonical и не имеет `noindex`;
- `/robots.txt` запрещает `/api/`, `/thank-you` и `/parts-request`, но не содержит `/cart`;
- `llms.txt` доступен, но не объявлен через alternate-ссылку в `<head>`;
- домашняя страница отдаёт Organization, WebSite и FAQPage JSON-LD;
- статья отдаёт Organization, Article и BreadcrumbList, но Article не содержит автора;
- товар отдаёт Product JSON-LD с Offer, seller, brand, MPN и изображением;
- product/article Twitter title и description наследуются от корневых metadata, а не всегда соответствуют текущей странице;
- поле `Category.parent` есть в типах и Directus mapper, но страница категории не показывает дочерние разделы;
- `Category.seoText` читается, но текущий route фактически выводит только hardcoded fallback при пустом поле;
- публичный HTML DEERE-SHOP тяжелее baseline CatPart и содержит больше client script tags;
- код умеет читать `yandexMetricaId`, но в текущем production HTML счётчик не обнаружен.

Эти наблюдения являются основанием для изменений; внешний сайт не используется как источник товарных цен, характеристик или юридических формулировок.

## 4. Архитектура решения

### 4.1. Индексация служебных маршрутов

Корзина остаётся рабочей для пользователя, но становится `noindex, follow` через route metadata. Она не добавляется в sitemap. В `robots.txt` не будет делаться единственная защита через `Disallow`, поскольку закрытый от обхода URL может не увидеть robots meta. Главный сигнал — серверный `noindex`; при необходимости robots будет использоваться только для явно приватных API/служебных путей.

Проверка:

- `GET /cart` → 200;
- initial HTML содержит `meta[name=robots]` со значением `noindex, follow`;
- `/sitemap.xml` не содержит `/cart`;
- пользовательская корзина и localStorage не изменяются.

### 4.2. Единый metadata builder

Создаётся небольшой серверный helper для page-specific social metadata. Он принимает title, description, canonical URL, type, image и image alt, а возвращает согласованные `openGraph` и `twitter` поля.

Правила:

- абсолютный canonical и image URL;
- текущие title/description/image используются и для Open Graph, и для Twitter;
- root defaults применяются только если страница не передала своё значение;
- пустое изображение не превращается в относительный или фиктивный URL;
- продукт сохраняет `website`/текущий проектный тип OG, статья — `article`;
- существующий `metadataBase` и title template сохраняются.

Страницы главной, каталога, категории, товара, списка статей и статьи используют helper без изменения URL-схемы.

Для главной нужно добавить `og:url` и использовать настроенное default OG image, если оно заполнено. Если в Directus изображения нет, не генерировать placeholder.

### 4.3. Article JSON-LD

В Article schema добавляются только подтверждённые поля:

- `author` — Person или Organization из `article.author`;
- `reviewedBy` — Person из `article.reviewer`, если поле заполнено;
- `publisher` — существующая Organization через `@id`;
- `datePublished`, `dateModified`, `image`, `mainEntityOfPage` сохраняются.

Пустые поля не будут сериализоваться. Реальные имена авторов и экспертов не создаются автоматически и не берутся из текста статьи.

### 4.4. Дерево категорий

Существующий `parentId` используется без изменения схемы Directus.

На `/catalog` строится bounded tree:

- корневые категории отображаются как основные разделы;
- дочерние категории отображаются внутри соответствующего раздела;
- ссылки ведут на существующий `/catalog/[categorySlug]`;
- циклы, неизвестные parent ID и повторные записи безопасно обрабатываются как корневые/пропущенные элементы без падения страницы;
- глубокое дерево не раскрывает бесконечное количество уровней в одном viewport: вложенность рендерится компактными группами.

На странице категории:

- breadcrumbs учитывают реальную цепочку родителей;
- дочерние разделы показываются перед списком товаров;
- внутренняя перелинковка не создаёт URL для unpublished/noindex категорий.

Запросы Directus остаются bounded и получают только необходимые поля. Товарные записи и цены не изменяются.

### 4.5. SEO-текст категории

Если `category.seoText` непустой, он проходит через безопасный renderer категории и отображается на странице. Если текущий `CategorySeoContent` принимает только заранее подготовленную fallback-модель, renderer расширяется для CMS plain text/структурированного значения. Hardcoded fallback используется только при отсутствии CMS-текста.

SEO-текст не вставляется через небезопасный raw HTML. Если текущий формат Directus — plain text, рендерятся абзацы; если структурированный формат уже поддержан существующим компонентом, используется этот компонент.

Текст не дублируется дважды на странице. H1 остаётся единственным и берётся из `category.h1 || category.title`.

### 4.6. Яндекс Метрика и согласие

Текущий analytics component сохраняет существующую конфигурацию через `site_settings.yandex_metrica_id`.

Правила загрузки:

- до согласия пользователя аналитический script не загружается;
- «Принять аналитику» сохраняет согласие и запускает Метрику один раз;
- «Только необходимые» сохраняет отказ и не запускает Метрику;
- повторное посещение использует сохранённое решение;
- отсутствие ID счётчика или ошибочный ID не ломает страницу;
- события сайта отправляются только после разрешения аналитики.

Не добавляются новые cookies без необходимости. Существующая cookie-панель и политика конфиденциальности остаются источником текста согласия.

### 4.7. Обнаружение `llms.txt`

В root layout добавляется:

```html
<link rel="alternate" type="text/plain" href="/llms.txt" title="Описание сайта для ИИ" />
```

Само содержание `llms.txt` не расширяется автоматически всеми товарами: текущий файл остаётся компактным и содержит только canonical разделы/статьи. Это вспомогательный discovery-сигнал, не замена sitemap или robots.

### 4.8. Производительность и клиентские границы

После baseline создаётся список client components, загружаемых на каждой странице. Изменения ограничиваются безопасными кандидатами:

- не переносить в client component серверный каталог, SEO-текст или карточку товара;
- не гидрировать интерактивные фильтры, корзину, cookie consent и формы раньше, чем нужно;
- отключить только необязательные глобальные client wrappers для маршрутов, где они не нужны;
- сохранить RouteTransition только если измерение подтверждает, что он не является основным источником веса и не ломает навигацию;
- использовать `next/image` с существующими sizes/priority/lazy правилами;
- не добавлять новый bundle analyzer dependency.

Цель первого этапа — снизить HTML/JS payload и проверить TTFB/total transfer. Точный рефакторинг выбирается по результатам локального build и публичного HTML baseline, а не по предположению.

## 5. Обработка ошибок и fallback

- Directus недоступен: страницы сохраняют существующие fallback metadata и не падают из-за отсутствующего SEO-текста;
- отсутствует parent: категория остаётся доступной как корневая;
- broken parent cycle: цикл разрывается защитой visited set;
- отсутствует author/reviewer: schema остаётся валидной без этих полей;
- отсутствует OG image: title/description остаются, image не выводится;
- отсутствует Metrika ID: analytics не запускается, UI не ломается;
- неизвестный тип аналитического consent: трактуется как отсутствие согласия;
- служебные route metadata не меняют HTTP status основной страницы.

## 6. Тестирование

Unit/integration:

- metadata helper: page-specific OG/Twitter, абсолютные URL, отсутствие пустых image;
- cart metadata: `noindex, follow`;
- Article schema: author/reviewer optionality and no empty fields;
- category tree: roots, nested children, missing parent, cycle, unpublished/noindex filtering;
- category SEO renderer: CMS text wins over fallback and is rendered once;
- analytics: accept/decline/persist/no-ID behavior;
- sitemap exclusion of cart;
- llms alternate link in root HTML.

Build checks:

- `npm run typecheck`;
- targeted Vitest suites;
- `npm run build`;
- `git diff --check`;
- `git diff --name-only` against the declared allowed surface.

Public route verification:

- `/`, `/catalog`, one nested category, one product, `/articles`, one article, `/cart`;
- `/robots.txt`, `/sitemap.xml`, `/llms.txt`;
- raw HTML checks for title, description, canonical, robots, OG/Twitter and JSON-LD;
- gzip transfer and script count before/after;
- mobile viewport smoke test for catalog tree, filters, cookie consent and cart.

## 7. Acceptance criteria

Работа считается выполненной, если:

1. Корзина не индексируется и не попадает в sitemap.
2. OG/Twitter каждой проверенной страницы соответствуют этой странице.
3. Article JSON-LD содержит автора/рецензента только при наличии данных.
4. Дочерние категории видны на каталоге и используются в breadcrumbs.
5. Заполненный SEO-текст категории выводится из Directus.
6. Метрика запускается только после разрешения и только при заданном ID.
7. `llms.txt` объявлен в `<head>` и остаётся доступным.
8. Товарный поиск, фильтры, заявки, загрузка Excel/фото и корзина работают как до изменений.
9. Размер и количество клиентских ресурсов не увеличились; выбранные оптимизации подтверждены измерением.
10. Все проверки проходят, а публичные маршруты отвечают ожидаемыми статусами.

## 8. Что не входит в эту реализацию

- массовое создание новых товарных позиций и характеристик;
- заполнение реального ID Яндекс Метрики, если его нет в Directus;
- изменение Directus schema/roles/permissions;
- переход на новую CDN/кэш-инфраструктуру;
- переписывание всех статей или генерация новых изображений;
- production deploy, commit или push без отдельного подтверждения после review.
