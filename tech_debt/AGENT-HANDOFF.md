# Handoff: продолжение tech-debt бэклога — состояние на 2026-08-28

Репозиторий: `D:\codex\JD_landing`, ветка `main`. Этот файл — актуальная точка передачи
агенту, продолжающему работу в новом чате. Читай его целиком перед любыми правками.

## Обязательное чтение перед стартом

1. `AGENTS.md` (корень) — правила скоуп-лока и чистоты репо. ГЛАВНЕЕ всего.
2. `docs/decisions/ADR-002-scope-locked-changes-and-content-only-releases.md`.
3. `tech_debt/README.md` — индекс бэклога (19 задач + stage-2 S-1…S-12).
4. Каждая задача `tech_debt/TD-NN-*.md` самодостаточна: симптом → доказательства →
   минимальный фикс → TDD-план → подводные камни → allowed files → верификация → «Не делаем».

## Текущее состояние git

- HEAD `main` = коммит TD-11 (см. лог ниже). Рабочее дерево чистое.
- **Весь P1 задеплоен на прод** (см. «Состояние VPS»). P2-коммиты локально/на GitHub,
  на прод НЕ выкачаны — потребуется релиз после завершения P2.
- Коммиты этой сессии (все CI-зелёные, каждый = одна задача, по allowed-files):

| Коммит | Задача |
|---|---|
| `5539b17` | docs: бэклог TD-01..TD-19 + этот handoff |
| `ca958fb` | TD-01 CI (.github/workflows/ci.yml; checkout с `lfs: true`) |
| `2ee4623` | TD-02 корзина: restore после F5, cross-tab, валидация (8 тестов) |
| `be66788` | TD-03 rate-limit suggestions 60/мин + /media/ 600/мин, нормализация кэш-ключа, кэпы id (20/100) |
| `462eb49` | TD-04 backup.sh путь compose + pg_restore-проверка; deploy.sh без мёртвых секретов |
| `0c493ea` | TD-05 seo-worker: createDaemon, per-item catch, тесты |
| `307ccdd` | TD-06 revalidate: faq_items + directus_files (+ флоу на VPS применён) |
| `1e60bff` | фикс cwd-хрупкости scripts/validate-import.test.mjs |
| `288b2aa` | docs: статусы P1 |
| `312082e` | ci: LFS + платформо-независимый isMainModule-тест |
| `87eeef7` | backup: pg_restore через маунт каталога (stdin через compose exec НЕ работает) |
| `04be869` | TD-07 удаление мёртвого кода (−250 строк) |
| `6753660` | TD-08 формат-хелперы: lib/format/{price,catalog-labels,tel,date} + collectUtmAttribution |
| `212442d` | TD-19 UTM-persistence: persistUtmOnce в Analytics (consent-независимо), фолбэк в collect |
| `426e0d1` | TD-09 разрез catalog.ts 987→605 + query.ts + product-media/product-analogs/search |
| `38e98c6` | TD-10 useFormSubmit: единый контракт сабмита 3 форм; CheckoutForm показывает server error |
| `79d0329` | TD-11 hero без throw (фолбэки+warn), каталог-корень деградирует, product loading.tsx, error.tsx Container |

## Что осталось сделать (порядок важен)

### P2 — остаток (2 задачи + финал)

1. **TD-12** (`TD-12-orders-money-path-tests.md`): orders.ts не имеет тестов (money-путь!).
   Сначала характеристические тесты (total-округление 0.1+0.2, снапшоты, компенсирующий
   DELETE при отказе item-write), затем батч-запись позиций одним POST `/items/order_items`
   с массивом. Осторожно: формат batch у живого Directus (см. подводные камни в задаче).
   Расширить `app/api/orders/route.test.ts` (400-валидация, отказ Turnstile).
2. **TD-13** (`TD-13-server-hardening.md`): timingSafeEqual-хелпер в lib/security (переезд
   из preview-роута), console.error в generic-catch leads/orders, IndexNow URL-парсинг внутрь
   guard (сейчас кривой env → 500 вебхука ПОСЛЕ успешной ревалидации), warn при частичной
   SMTP-конфигурации, connection/socketTimeout в nodemailer, getSmtpEnv → null вместо `!`.
   Примечание: мемоизация env (бывший 13.6) исключена ревью — НЕ делать.
3. **Финал P2**: полный прогон всех наборов, обновить чекбоксы в `tech_debt/README.md`,
   спросить владельца про TD-14 (аналоги: подключить опцию A или похоронить опцию B).

### P3 (после P2): TD-15 → TD-18 (см. файлы задач).

### Затем: stage-2 S-1…S-12 — только обсуждение с владельцем, НЕ код без решения.

## Состояние VPS (91.227.68.68.176 — доступ см. ниже)

- SSH: `ssh -i /c/Users/Elena/.ssh/jd_landing_deploy codex-deploy@91.227.68.176`
  (из Git Bash; BatchMode=yes работает).
- Release-checkout: `/opt/jd-landing/release`, на `main` @ `87eeef7`. ВАЖНО: раньше стоял
  на устаревшей ветке `agent/production-infrastructure` (f831004) — проверено, что её контент
  входит в main через squash `7a3c402`, отката не было; владение файла чекаута поправлено
  chown'ом на codex-deploy (файлы от root ломали git pull — чистить через `sudo git clean`,
  затем `git reset --hard origin/main`).
- **Задеплоено и проверено (P1)**: deploy.sh отработал (frontend healthy, ISR прогрет),
  реvalidация-флоу обновлён через контейнер (node на VPS НЕТ — запускать так:
  `sudo bash -c 'set -a; . /opt/jd-landing/.env; set +a; docker run --rm --network jd-landing_backend -v /opt/jd-landing/release/directus:/work -w /work --env DIRECTUS_URL=http://directus:8055 --env NEXT_REVALIDATE_URL=http://frontend:3000/api/revalidate --env REVALIDATE_SECRET --env DIRECTUS_ADMIN_EMAIL --env DIRECTUS_ADMIN_PASSWORD directus/directus:12.1.1 node flows/apply-revalidation-flow.mjs'`),
  вебхуки faq_items/directus_files проверены curl'ом (`{"ok":true}`), backup.sh end-to-end
  (дамп 18M + pg_restore + тарбол 102M), seo-worker пересобран с TD-05 (`--profile seo-factory up -d --build seo-worker`; фабрика включена: enabled=true, schedule=true).
- Роуты проверены: `/`, `/catalog`, карточка продукта — 200; suggestions работает.
- **P2-коммиты (04be869..79d0329) на прод НЕ выкачаны.** Релиз после P2:
  `git pull --ff-only && git lfs pull` в release, затем `sudo bash deploy.sh` из
  `/opt/jd-landing/release/deploy`. Остатки на VPS (косметика, спросить владельца):
  устаревшая ветка-указатель, копия compose в `/opt/jd-landing/`, осиротевший дамп
  `directus-20260827T114438Z.dump` (сам удалится за 14 дней).

## Процесс и правила исполнения (выработаны сессией)

1. Одна задача = один коммит = файлы строго из «Allowed files» задачи. Перед коммитом —
   `git diff --cached --name-only` против списка.
2. TDD: характеристический тест ПЕРВЫМ (убедиться, что он красный на баге).
3. Верификация перед каждым коммитом, из `frontend/` (НЕ из корня — `brand-assets.test`
   читает от `process.cwd()`):
   ```
   cd frontend && npm run typecheck && npm test && npm run lint
   ```
   seo-worker/directus: `npm test` в их папках; из корня репо: `node --test deploy/ scripts/`.
4. **НЕ маскировать коды возврата пайпами**: `npm run typecheck | tail` возвращает 0 всегда —
   один коммит уже ушёл с тайп-ошибкой из-за этого (поправлено amend'ом). Используй
   `cmd && echo OK` без пайпов, или проверяй `$?`.
5. Коммитить по задачам, пушить после готовности пакета (владелец ранее приказал
   «коммит и пуш» — пуш после завершения P2 согласовать, CI на GitHub проверяет всё).
6. Решения владельца обязательны для: TD-14, любых untrack/drop файлов (TD-17/18),
   изменений в deploy/directus-зонах сверх описанного в задачах.

## Известные подводные камни (найдены в этой сессии)

- `docker compose exec -T ... /dev/stdin` НЕ передаёт байты в pg_restore — верификация дампа
  только через маунт каталога в `postgres:17-alpine`.
- Directus batch-формат POST `/items/<collection>` с массивом тел — сверить с живым инстансом
  перед TD-12 (в задаче описано).
- Циклические импорты catalog ↔ search/product-analogs работают (обращения только на вызове),
  но не добавляй top-level зависимости между ними.
- `export *` не вводит имена в локальный скоуп модуля — нужен отдельный `import` для
  внутреннего использования.
- Тесты запускаются только из `frontend/`; CWD между bash-вызовами сохраняется — всегда
  `cd` явно.
- seo-factory.env.example: строки `SEO_FACTORY_ALLOW_*` НЕ удалять — их ассертит
  `deploy/seo-factory.test.mjs` (вне скоупа задач).

## Контрольный список завершения P2

- [ ] TD-12 сделан, заказы покрыты тестами, батч-запись проверена
- [ ] TD-13 сделан (6 подпунктов; 13.6-мемоизацию не делать)
- [ ] Полный прогон: frontend + seo-worker + directus + deploy/scripts зелёные
- [ ] `tech_debt/README.md` статусы обновлены, коммит docs
- [ ] Вопрос владельцу: TD-14 (A: подключить аналоги / B: похоронить) + пуш P2 + релиз на VPS
