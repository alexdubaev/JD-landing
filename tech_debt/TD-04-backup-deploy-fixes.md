# TD-04 — deploy/: backup.sh указывает на несуществующий compose-файл + мёртвые секреты в deploy.sh

- **Приоритет:** P1 (бэкапы, вероятно, не работают вообще; DEPLOY.md объявляет «восстановление из бэкапа» планом на инцидент данных)
- **Усилие:** S (~2–4 ч; проверка требует доступа к VPS — согласовать с владельцем)
- **Тип:** infra / bug
- **Зависимости:** нет. RIGHT NOW известна только из кода — на VPS может лежать копия compose в корне (тогда путь случайно работает; фикс всё равно правильный).

## Симптом и влияние

`deploy/backup.sh` после `cd /opt/jd-landing` вызывает `docker compose -f compose.production.yml`,
но compose-файл живёт в `/opt/jd-landing/release/deploy/compose.production.yml` (так его ищет
`deploy.sh:23` и DEPLOY.md). Если в корне нет копии — каждый запуск бэкапа падает с
«no configuration file found» **до** pg_dump. Узнать это можно только зайдя на VPS: cron/вывод
нигде не мониторится. Плюс мелочи в том же домене: deploy.sh читает админ-пароль Directus в shell
не используя его; compose передаёт seo-worker env-флаги, которые тот игнорирует.

## Доказательство (file:line)

1. `deploy/backup.sh:10` — `cd /opt/jd-landing`; `:21` — `docker compose --env-file .env -f
   compose.production.yml exec -T database …` (относительный путь от корня проекта).
   `deploy/deploy.sh:23` — `COMPOSE_FILE="/opt/jd-landing/release/deploy/compose.production.yml"`.
2. `deploy/deploy.sh:39–41` — `DIRECTUS_TOKEN`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`
   читаются в переменные и далее не используются (grep по файлу: используется только
   `REVALIDATE_SECRET`, строка ~150).
3. `deploy/compose.production.yml:86–87, 91` — `SEO_FACTORY_ALLOW_APPLY`, `SEO_FACTORY_ALLOW_PUBLISH`,
   `SEO_FACTORY_WORKER_ROLE_ID` прокинуты в сервис seo-worker, но `seo-worker/src/config.mjs:150–162`
   их не читает (allowApply/allowPublish захардкожены `false`). Оператор, выставивший флаг в `.env`,
   не получит ни эффекта, ни предупреждения.
4. `deploy/deploy.sh:25` — `FRONTEND_CONTAINER="jd-landing-frontend-1"` захардкожен (зависит от
   naming compose).

Примечание: HSTS в этой задаче НЕ трогаем — он уже выдаётся приложением
(`frontend/next.config.ts`, `headers()` → `Strict-Transport-Security: max-age=31536000;
includeSubDomains; preload`); дублирование его в Caddyfile создало бы второй источник того же
заголовка.

## Решение (минимальное)

1. **backup.sh:**
   - `COMPOSE_FILE="${COMPOSE_FILE:-${project_dir}/release/deploy/compose.production.yml}"` и
     использовать `-f "${COMPOSE_FILE}"`;
   - после pg_dump добавить sanity-check дампа: `pg_restore --list "${backup_dir}/directus-${timestamp}.dump"
     >/dev/null` (упадёт с ненулевым кодом на битом/пустом дампе — копеечная «restore-проверка»);
   - вывести в конце `ls -lh` созданных файлов (удобно для cron-лога).
2. **deploy.sh:** удалить строки чтения трёх неиспользуемых секретов (39–41). Контейнер определять
   через `docker compose -f "$COMPOSE_FILE" ps -q frontend` вместо захардкоженного имени.
3. **compose.production.yml:** убрать три игнорируемых env из блока seo-worker (флаги либо читать в
   config.mjs — нет, не надо: минимальный путь — удалить, чтобы не врать оператору).
4. **backup.test.mjs:** обновить под новые строки (путь compose, pg_restore).

## Подводные камни

1. **Не запускать бэкап-скрипт с fix'ом «на авось» на VPS без владельца** — изменения деплойные,
   ADR-002: deploy-зона read-only без явного запроса. Задача = код + ревью; исполнение на VPS
   согласовывается отдельно.
2. `pg_restore --list` требует установленных postgres-clienttools в образе, ЗАПУСКАЕТСЯ НА ХОСТЕ
   (не в контейнере) — на голом VPS может не быть бинария. Альтернатива: запускать проверку в том же
   postgres-контейнере (`docker compose exec -T database sh -c "pg_restore --list /dev/stdin" < dump`).
   Выбрать вариант, который реально работает на хосте (уточнить при первом прогоне).
3. Удаление env-флагов из compose **не должно** задеть одноимённые переменные в сервисе directus
   (WORKER_ROLE_ID нужен там для токен-скрипта) — удаляем только из блока `seo-worker`.
4. `docker compose ps -q frontend` пуст, если сервис называется иначе — сверить имя сервиса в compose
   (`frontend:`).

## Allowed files (ADR-002)

- `deploy/backup.sh`, `deploy/backup.test.mjs`
- `deploy/deploy.sh`, `deploy/deploy.test.mjs`
- `deploy/compose.production.yml`
- `DEPLOY.md` — только если меняется пользовательский контракт бэкапа (раздел про восстановление).

## Верификация

1. `node --test deploy/` из корня — зелёные.
2. Согласованный прогон на VPS: `sh backup.sh` создаёт `.dump` + `.tar.gz`, `pg_restore --list`
   проходит; проверить, что в cron/логе нет прежней ошибки.
3. `deploy.sh` после правки: dry-run шагов чтения env (убедиться, что REVALIDATE_SECRET по-прежнему
   читается).

## Не делаем

- Не строим автоматический rollback (stage-2 S-2), не меняем restic-политику, не добавляем
  мониторинг/aliveness для бэкапов, не выносим IP из Caddyfile (stage-2, инфраструктурное решение).
