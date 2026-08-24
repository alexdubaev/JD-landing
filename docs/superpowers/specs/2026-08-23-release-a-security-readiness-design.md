# Release A: Security Readiness — дизайн

## Контекст и цель

Release A переносит на актуальный `agent/production-infrastructure` только
безопасные и проверяемые улучшения из устаревшей ветки
`agent/security-hardening`. Релиз не включает SEO Factory и не изменяет
содержимое каталога, Directus-схему, роли, UI или обработку заявок за
пределами валидации/защиты входящих HTTP-запросов.

Цель: перед production rollout сайт сохраняет item-aware revalidation и
принимает заявки при текущем отсутствии Turnstile/restic/Basic Auth secrets,
при этом не доверяет клиентским proxy-заголовкам и ограничивает фактический
размер потокового request body.

## Граница релиза

### Разрешённые файлы

- `deploy/Caddyfile`, `deploy/compose.production.yml`, `deploy/backup.sh`,
  `deploy/deploy.sh`, `.env.production.example`, соответствующие тесты и
  security runbook;
- `directus/create-frontend-token.mjs` и его тесты;
- `frontend/next.config.ts`, `frontend/src/proxy.ts`;
- `frontend/src/app/api/leads/route.ts`, `orders/route.ts`,
  `revalidate/route.ts` и их тесты;
- `frontend/src/lib/security/**`, необходимые validation helpers и тесты;
- эта спецификация и документация Release A.

### Защищённые области

Без отдельного разрешения не меняются продукты, категории, статьи, каталоговые
маршруты, Directus content/schema/roles, UI, notifications, секреты,
dependencies, Docker-образы/версии и пользовательские незакоммиченные файлы
основного checkout. SEO Factory — отдельный Release B.

### Обязательные проверки маршрутов

Локально: `/`, `/catalog`, случайный product route, `POST /api/leads`,
`POST /api/orders`, `POST /api/revalidate`. После отдельного разрешения на
deploy: те же public routes, CMS login за Basic Auth и изолированное
восстановление backup.

## Выбранный подход

Не переносить security-ветку целиком и не включать защиту, для которой в
production нет конфигурации. Вместо этого построить backward-compatible
hardening вокруг текущей production topology: Caddy — единственная
доверенная граница proxy; Next не использует client-provided
`X-Forwarded-For` как источник ключа rate limit; заявочные endpoints сами
потоково читают тело с byte budget.

Это предпочтительнее варианта «включить всё и попросить секреты потом» — он
отклоняет все заявки — и варианта «оставить security-ветку без адаптации» — он
теряет точечную инвалидизацию product/category/article путей.

## Компоненты и поток данных

### Deploy preflight

`deploy.sh` получит read-only preflight **до** build/recreate:

1. Если Caddy Basic Auth включён конфигурацией, проверить непустые
   `DIRECTUS_CMS_AUTH_USER` и `DIRECTUS_CMS_AUTH_HASH`; при отсутствии
   завершиться до изменения контейнеров.
2. Turnstile не становится обязательным, пока есть только site key либо
   отсутствует secret. Конфигурация отсутствует — endpoints продолжают
   текущую работу; конфигурация включена полностью — ошибка провайдера или
   timeout отклоняет конкретную заявку.
3. Текущий локальный backup не заменяется restic-only механизмом. Отдельный
   backup release возможен только после наличия restic settings и restore
   test. Скрипт может выполнять диагностический preflight, но не объявляет
   неподготовленный restic backup рабочим.

Preflight никогда не печатает значения environment variables.

### Request hardening

`readBodyWithinLimit(request, limit)` считает реальные bytes каждого chunk и
отклоняет payload, который превышает limit, независимо от отсутствующего или
ложного `Content-Length`. `leads` и `orders` преобразуют ограниченные bytes в
JSON и отдают `413` для превышения, `400` для malformed JSON.

Rate limiting остаётся best-effort in-memory и документируется как незащита от
распределённой нагрузки. Его ключ не строится из непроверенного forwarded
header. Если Caddy передаёт один canonical trusted client IP, проверка строго
принимает только один валидный адрес; цепочка или malformed header приводит к
общему ограниченному ключу, а не к подмене IP. В production Caddy очищает
входящий `X-Forwarded-For` и назначает свой единственный заголовок перед
proxying. Точная Caddy директива будет подтверждена `caddy validate` и тестом.

### Turnstile

`verifyTurnstile` имеет конечный timeout через `AbortSignal.timeout` (либо
эквивалент Node 20) и fail-closed результат при активированной конфигурации,
ошибке или timeout. Отсутствующая конфигурация остаётся явным opted-out режимом
до отдельного owner approval; это не является скрытым bypass после включения.

### Revalidation

Существующая модель collection tags плюс `id`, `oldSlug`, `newSlug` сохраняется
без изменения семантики. Любые новые body-reader/validation изменения должны
быть обратносуместимы с Directus webhook payload и покрыты текущими плюс новыми
тестами.

## Ошибки, observability и безопасность

- ошибки preflight содержат только имя отсутствующей настройки;
- endpoints возвращают общие клиентские сообщения, без token/secret details;
- нет логирования request body, credentials или Turnstile token;
- timeout Turnstile не оставляет hanging request;
- `429`, `413`, `400`, `401` сохраняют предсказуемый JSON response format;
- Basic Auth не активируется автоматически: включение требует явной
  конфигурации и preflight.

## TDD и verification

Сначала добавить и увидеть failing tests для: item-aware revalidation;
unconfigured Turnstile без отказа заявки; streaming body без
`Content-Length`; spoofed/ambiguous forwarded header; Basic Auth/backup
preflight; Turnstile timeout. Затем реализовать минимальные изменения.

До review/commit выполнить:

```powershell
cd frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high

cd ..\deploy
node --test caddyfile.test.mjs deploy.test.mjs

cd ..\directus
node --test access/blueprint.test.mjs schema/blueprint.test.mjs schema/platform-compatibility.test.mjs
```

Перед commit и deploy: `git diff --name-only` должен быть подмножеством
разрешённого списка. После реализации — отдельный security/code-quality review.
Production deploy, production secret provisioning и включение Basic Auth,
Turnstile или restic в этот дизайн не включены и требуют отдельного owner
approval после прохождения локальных gates.
