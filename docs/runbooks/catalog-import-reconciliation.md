# Runbook: импорт каталога через importer/cli.mjs (R9)

Заменяет списанный `import/products.mjs` (полный payload PATCH — запрещён,
ADR-003). Импортёр владеет ТОЛЬКО полями своего профиля; всё остальное —
громкий конфликт, а не молчаливое затирание.

## Профили

| Профиль | Поля | Требует `--approval-ref` |
|---|---|---|
| `operations-default` | price, price_status, availability_status, delivery_status, source_name, source_url, verified_at | нет |
| `trusted-weight` | + weight | да |
| `editorial-opt-in` | + title, short/full_description, image_alt | да |
| `media-opt-in` | + main_image, gallery | да |
| `codes-opt-in` | + mpn | да |
| `analogs-opt-in` | + связи products_analogs | да |

Новые товары всегда создаются `draft`. `status/slug/category/SEO` не пишет
НИ один профиль. Публикация — только руками (Publisher/Admin).

## Вход

NDJSON, строка = товар: `{"sku": "...", "price": 1234.5, ...}`.
(Конвертация прайса в NDJSON — вне инструмента.)

## Стандартный прогон

```powershell
$env:DIRECTUS_URL = 'https://<directus>'
# креды admin через env (см. основной runbook)
$env:JD_RELEASE_DIR = 'D:\jd-release-packets\IMP-<date>'

cd directus
# 1) ВСЕГДА сначала dry-run (дефолт; пишет только план в JD_RELEASE_DIR)
node importer/cli.mjs --profile=operations-default --input=<file.ndjson> --output=$env:JD_RELEASE_DIR

# 2) Смотреть план: importer-plan-*.json — исходы create-draft/patch/skip/conflict.
#    Конфликты = запрещённые поля в источнике: чинить ИСТОЧНИК, не профиль.

# 3) Apply (только после review плана владельцем)
node importer/cli.mjs --profile=operations-default --input=<file.ndjson> `
  --apply --release-id=imp-<date>-01 --output=$env:JD_RELEASE_DIR

# 4) Reconcile (проверка завершённости/драфтов/защищённых полей)
#    выполняется автоматически после apply; повторно:
#   (см. report в JD_RELEASE_DIR)
```

## Opt-in профили

Добавить `--approval-ref=<ссылка на одобрение владельца>` — иначе отказ до
любого запроса. Editorial/media/codes/analogs профили дополнительно требуют
preview diff владельцем до apply.

## Прерывание и докачка

Прогон упал (сеть/токен): повторить ТОТ ЖЕ command с `--resume=<offset>`
(offset — последний подтверждённый из отчёта `importer-report-*.ndjson`).
Идемпотентно: завершённые записи пропустятся.

## Rollback

```powershell
node importer/cli.mjs --rollback --release-id=imp-<date>-01 `
  --apply --output=$env:JD_RELEASE_DIR
```
Восстанавливает точный before-state; созданные драфты удаляет (только пока
они draft); НЕ откатывает, если редактор успел поменять защищённые поля
(title/slug/SEO/…) — стоп с `protected-field-changed`, решать вручную.

## Стоп-условия

- конфликты в плане не разобраны;
- manifest входа изменился между dry-run и apply;
- protect-field drift при rollback;
- созданный товар кто-то опубликовал (rollback откажется удалять);
- любые 4xx/5xx от Directus после ретраев.

## Артефакты (в закрытом JD_RELEASE_DIR вне репозитория)

`importer-manifest.json`, `importer-plan-*.json`, `importer-before-state-*.ndjson`,
`importer-report-*.ndjson` (append-only), сводка reconcile. Токены/цены
реальных товаров в тестах и логах не появляются.
