# Обратимый релиз Directus

Этот runbook применяется к каждому data/schema/security-релизу Deere-Shop. Для
metadata-only и tooling-only релизов используйте только относящиеся к ним шаги, но не
ослабляйте scope-lock и stop-on-diff.

## 1. Scope-lock и закрытая директория

До любых действий запишите:

- требуемое поведение и release ID;
- разрешённые файлы, коллекции и поля;
- защищённые области;
- approval reference;
- маршруты проверки и критерии отката.

Создайте закрытую абсолютную директорию **вне репозитория** и ограничьте доступ к ней.
Не используйте `D:\codex\JD_landing`, его подпапки или VPS web root. Укажите пути в
PowerShell без вывода токенов:

```powershell
$env:JD_RELEASE_DIR = 'D:\jd-release-packets\R1-2026-08-13'
$env:JD_BASELINE_BEFORE = "$env:JD_RELEASE_DIR\baseline-before.json"
$env:JD_BASELINE_AFTER = "$env:JD_RELEASE_DIR\baseline-after.json"
$env:JD_REVIEWED_BASE = '<reviewed-commit-sha>'
$env:DIRECTUS_READONLY_TOKEN = '<dedicated-read-only-token>'
```

Существующие baseline/reconciliation-файлы не перезаписываются. Новый запуск получает
новый release ID или новый закрытый packet directory.

## 2. Обязательный release packet

До закрытия релиза packet должен содержать:

```text
release.json
git-head.txt
schema-before.json
schema-after.json
counts-before.json
counts-after.json
relations-before.json
relations-after.json
plan.json
before-state.ndjson
apply-report.ndjson
reconciliation.json
rollback-plan.json
route-checks.json
```

`release.json` фиксирует release ID, UTC time, operator, target environment, git SHA,
allowed files/collections/fields, backup filenames и approval reference. Не сохраняйте
в packet токены, пароли, email, телефоны, тексты заявок, комментарии менеджеров,
внутренние цены или полные товарные выгрузки. `leads` и `orders` попадают в baseline
только как aggregate counts.

## 3. Backup до data/schema/destructive-релиза

На установленной production-копии `/opt/jd-landing/release` запустите существующий
`deploy/backup.sh`. Не изменяйте скрипт в рамках продуктового релиза.

Проверьте оба архива:

```bash
pg_restore --list /absolute/path/to/database.dump
tar -tzf /absolute/path/to/files.tar.gz
```

Скопируйте database dump и files archive за пределы VPS. Зафиксируйте имена, размеры и
SHA-256 в `release.json`. Ошибка проверки или отсутствие off-server copy останавливает
релиз.

## 4. Restore rehearsal

До production apply восстановите dump и files archive на disposable PostgreSQL/Directus
instance тех же версий: PostgreSQL 17 и Directus 12.1.1. Поднимите Directus, выполните
read-only counts/hash baseline и один маршрут каждого типа. Запишите результат и время
в `rollback-plan.json`. Написанная, но не выполненная команда restore не считается
проверенным rollback.

## 5. Read-only baseline до изменения

Из `directus/` выполните:

```powershell
npm run release:baseline -- --output=$env:JD_RELEASE_DIR --label=before
```

Collector выполняет только GET-запросы, постранично читает явный allowlist полей,
хеширует отсортированные строки и сохраняет для заявок/заказов только counts. Он
откажется писать по относительному пути, внутрь репозитория, поверх существующего файла
или рядом с JSON, содержащим чувствительные поля.
Он требует отдельный `DIRECTUS_READONLY_TOKEN` и не выполняет login/password fallback.

Сверьте baseline с обязательными production-инвариантами:

- 12 971 товаров и 12 971 опубликованных товаров;
- 283 товара с legacy gallery и 1 251 file reference;
- 18 категорий, 3 статьи, 2 страницы, 13 секций, 12 FAQ и 4 заявки;
- 25 физических project collections;
- новых broken relations нет.

Расхождение с известным baseline — stop condition. Не исправляйте production в рамках
проверки.

## 6. Plan, dry-run и apply

Сохраните точный `plan.json`, before-state только для изменяемых записей и команды
rollback. Выполните dry-run. Проверяющий обязан сопоставить diff с allowlist полей и
утверждённым scope. Apply разрешён только после backup, rehearsal, baseline и approval.

Записывайте минимальные patches и append-only `apply-report.ndjson`. При первой записи
вне allowlist, конфликте stale hash, неожиданном количестве строк или ошибке relation
немедленно остановите batch.

## 7. Baseline после и reconciliation

```powershell
npm run release:baseline -- --output=$env:JD_RELEASE_DIR --label=after
npm run release:compare -- --before=$env:JD_BASELINE_BEFORE --after=$env:JD_BASELINE_AFTER --output=$env:JD_RELEASE_DIR
```

Для релиза, которому разрешено менять конкретные коллекции или metadata, передайте их
явно:

```powershell
npm run release:compare -- --before=$env:JD_BASELINE_BEFORE --after=$env:JD_BASELINE_AFTER --output=$env:JD_RELEASE_DIR --allowed-collections=categories --allowed-metadata=fields,relations
```

Известные production counts проверяются comparator автоматически. Для релиза с заранее
утверждённым изменением count создайте закрытый JSON с новыми ожидаемыми значениями и добавьте
`--expected-counts=D:\absolute\outside-repo\expected-counts.json`.

Comparator возвращает non-zero exit code при потере товара, неожиданной депубликации,
новой broken relation, изменении защищённой collection/metadata или несовпадении
объявленного invariant. Любой такой diff блокирует следующий шаг и запускает rollback
decision; его нельзя объявлять «ожидаемым» постфактум.

## 8. Route checks

Сохраните HTTP status, canonical URL и UTC time в `route-checks.json`. Минимум:

- `/`;
- `/catalog`;
- по одному category и product URL из baseline manifest;
- по одному article URL из baseline manifest;
- `/about`;
- `/delivery`;
- `/contacts`;
- `/parts-request`.

Для frontend-релиза дополнительно выполните визуальную проверку desktop/mobile. Ошибка
маршрута или SEO drift останавливает релиз.

## 9. Git и завершение

До commit и deployment:

```powershell
git diff --check
git diff --name-only
git diff --cached --name-only
git rev-parse HEAD
```

Списки файлов обязаны точно совпадать с allowlist. Не используйте `git add -A`. В релиз
попадает один reviewed commit, а production checkout должен указывать именно на него.
Push и deployment выполняются только по отдельной явной команде владельца.

Релиз завершён только когда reconciliation имеет `ok: true`, routes проверены, packet
заполнен, backup хранится off-server, а rollback rehearsal документирован.
