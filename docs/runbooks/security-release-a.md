# Release A — Security Readiness Runbook

Этот runbook относится только к security readiness release на базе
`agent/production-infrastructure`. Он не включает SEO Factory, Directus schema,
роли, каталог или контент.

## Граница и обязательное состояние

- frontend принимает только ограниченные по фактическим bytes JSON/multipart
  bodies для `/api/leads` и `/api/orders`;
- Caddy очищает входящий `X-Forwarded-For` и передаёт Next.js один адрес
  `{http.request.remote.host}`;
- неоднозначная цепочка forwarded headers попадает в best-effort bucket
  `unknown`, а не используется как IP атакующего;
- Turnstile проверяется только когда `TURNSTILE_SECRET_KEY` настроен. Пока
  secret отсутствует, текущий явный opted-out режим не отклоняет все заявки;
- Basic Auth Directus и restic backup не включаются автоматически;
- `/api/revalidate` сохраняет collection tags и item-aware invalidation по
  `id`, `oldSlug`, `newSlug`.

## Preflight перед любым deploy

Работать на VPS из `/opt/jd-landing/release/deploy` от пользователя
`codex-deploy`. Реальный env-файл хранится только в
`/opt/jd-landing/.env`; значения не копировать в терминал, Git или handoff.

```sh
sudo test -r /opt/jd-landing/.env
sudo docker compose --env-file /opt/jd-landing/.env \
  -f /opt/jd-landing/release/deploy/compose.production.yml config >/dev/null
```

`deploy.sh` сам выполняет preflight до `docker compose build` и `up`:

- `ENABLE_DIRECTUS_CMS_BASIC_AUTH=false` — безопасное состояние Release A;
- если выставлено `true`, активный `basic_auth` должен присутствовать в
  Caddyfile, а `DIRECTUS_CMS_AUTH_USER` и `DIRECTUS_CMS_AUTH_HASH` должны быть
  непустыми. При нарушении deploy останавливается до пересоздания контейнеров;
- `ENABLE_RESTIC_BACKUP=false` — безопасное состояние Release A;
- если выставлено `true`, preflight проверяет repository, readable password
  file и команду `restic`, затем всё равно останавливает rollout: restic требует
  отдельный restore-tested release.

Проверка настроек не печатает их значения:

```sh
sudo bash /opt/jd-landing/release/deploy/deploy.sh
```

Не обходить preflight ручным `docker compose up` для production release.

## Локальные gates

```powershell
cd frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high

cd ..\deploy
node --test caddyfile.test.mjs deploy.test.mjs backup.test.mjs

cd ..\directus
node --test access/blueprint.test.mjs schema/blueprint.test.mjs schema/platform-compatibility.test.mjs
```

Высокие audit findings, уже присутствовавшие в production baseline, фиксируются
отдельно и не маскируются изменением lockfile.

## После deploy (только после owner approval)

Проверить public routes `/`, `/catalog` и случайную карточку товара. Затем
проверить:

1. `POST /api/leads` с валидным JSON и с chunked body в пределах лимита;
2. `POST /api/leads` и `/api/orders` с body выше лимита — ожидается `413`;
3. `/api/revalidate` с secret — ожидается `200`, tags и item-aware paths;
4. CMS login за Basic Auth только если auth был отдельно одобрен и настроен;
5. обычный локальный backup: PostgreSQL dump, uploads archive и 14-дневное
   удержание в `/opt/jd-landing/backups`.

Если установлен бинарник Caddy, перед применением проверить конфигурацию:

```sh
sudo caddy validate --config /opt/jd-landing/release/deploy/Caddyfile
```

## Restore gate

В Release A допускается только проверка существующего локального backup. Restic
remote backup и production restore не объявляются готовыми без отдельного
owner-approved release, доступного destination, изолированной PostgreSQL 17
базы и зафиксированного restore test. Во время restore не использовать
production database или production Directus volume.

## Rollback и инциденты

- При провале preflight контейнеры не изменяются.
- При проблеме после compose recreate остановить rollout, сохранить только
  безопасные диагностические метаданные без request bodies/секретов и вернуть
  предыдущий reviewable commit штатным процессом release.
- Не отключать security headers и не расширять trusted proxy list как быстрый
  workaround.
