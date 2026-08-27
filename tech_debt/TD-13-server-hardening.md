# TD-13 — Серверный hardening: timing-safe секрет, видимость ошибок Directus, env, SMTP, IndexNow

- **Приоритет:** P2 (набор мелких серверных правок одного домена; каждая — строки, вместе — закрывают реальные слепые зоны)
- **Усилие:** S (~3–5 ч суммарно)
- **Тип:** security / observability
- **Зависимости:** нет. Частично пересекается с TD-03 (route-файлы) — координировать порядок.

## Состав (по пунктам, каждый независим)

### 13.1 — Timing-unsafe сравнение секрета реvalidации
- `app/api/revalidate/route.ts:126` — `request.headers.get("x-revalidate-secret") !== secret`
  (сравнение строк — ранний выход по длине/первым байтам). Рядом `api/preview/route.ts:57–61` уже
  делает правильно (`timingSafeEqual`).
- **Фикс:** вынести `secretsMatch(provided, expected)` в `lib/security/` (из preview-роута),
  использовать в обоих. Осторожно: `timingSafeEqual` бросает на разной длине — текущая
  preview-реализация уже решает это (хэшировать обе стороны или паддить) — переиспользовать её.
- Тест: `lib/security/secrets.test.ts` — равные/неравные/разной длины не бросают.

### 13.2 — Слепота к отказам Directus на money-маршрутах
- `api/leads/route.ts:168–188`, `api/orders/route.ts:59–84` — любой неожиданный отказ маппится в
  безликий 503; статус/путь ошибки (DirectusRequestError) выбрасываются. Прод-даун Directus
  невидим: ни в логах, ни в метриках.
- **Фикс:** `console.error("[leads] submit failed", { status: err?.status, path: err?.path })`
  в generic-catch (по образцу `lib/notifications/notify.ts:91`). Ничего больше — логи уже
  собираются docker'ом.

### 13.3 — IndexNow: парсинг URL вне guard'а роняет вебхук после успешной ревалидации
- `lib/seo/indexnow.ts:41–42` — `new URL(process.env.NEXT_PUBLIC_SITE_URL)` стоит **до** try/catch
  (тот оборачивает только fetch, :60–78). Кривое-но-непустое значение env → исключение внутри
  `notifyIndexNow` (`api/revalidate/route.ts:203`) → вебхук отвечает 500 **после** того, как
  реvalidация прошла — Directus-флоу видит ошибку и может ретраить впустую.
- **Фикс:** перенести парсинг внутрь guard'а, при невалидном URL — warn и тихий возврат
  (IndexNow — оптимизация, не критический путь).

### 13.4 — Notifications env: частичная конфигурация молча отключает уведомления
- `lib/notifications/env.ts:42–50` — если из 5 SMTP-переменных заполнена не вся структура,
  `isNotificationsEnabled() === false` без единого лога. Опечатка в одном env — и менеджер
  перестаёт получать лиды, пока кто-то не заметит.
- **Фикс:** при частичной конфигурации — `console.warn("[notifications] partially configured —
  disabled. Check SMTP_* / NOTIFY_* vars")` (один раз при первом вызове — memo-флаг).

### 13.5 — SMTP без таймаутов блокирует ответ лид-формы
- `lib/notifications/notify.ts:49–60` — nodemailer-транспорт без `connectionTimeout`/`socketTimeout`;
  `notifyNewLead` await'ится роутом (`api/leads/route.ts:147`). Медленный SMTP добавляет секунды
  (десятки секунд) к «успешной» отправке заявки.
- **Фикс:** `connectionTimeout: 5_000, socketTimeout: 5_000` в createTransport. Не переводить на
  fire-and-forget (меньше движущихся частей; таймаут решает 95% проблемы).

### 13.6 — notify.ts non-null assertions
- `notify.ts:75,84,89` — `env.SMTP_USER!` и др., безопасность обеспечивается тем, что другой модуль
  где-то вызвал `isNotificationsEnabled`. **Фикс:** `getSmtpEnv()` возвращает `null` при неполной
  конфигурации; колл-сайт узко типизируется. Мини-правка, убирает межмодульную связку по договору.

Порядок: эту задачу выполнять **после** TD-06 — обе правят `app/api/revalidate/route.ts` и его тест.

(Мемоизация `getServerEnv` из ранней версии задачи исключена: выигрыш околонулевой, а экспорт
тест-хелпера — лишний публичный контракт модуля.)

## Allowed files (ADR-002)

- `frontend/src/lib/security/` (новый `secrets.ts` + тест), `app/api/preview/route.ts` (переезд на хелпер)
- `frontend/src/app/api/revalidate/route.ts` (+тест), `frontend/src/app/api/leads/route.ts`,
  `frontend/src/app/api/orders/route.ts` (только console.error)
- `frontend/src/lib/seo/indexnow.ts` (+тест)
- `frontend/src/lib/notifications/{env,notify}.ts` (+тесты)

## Верификация

1. `npm test` — новые юнит-тесты + существующие (preview/revalidate) зелёные.
2. Локально: вебхук реvalidации с кривым `NEXT_PUBLIC_SITE_URL` → `{"ok":true}` + warn в логе;
   с частичным SMTP-env при отправке лида → warn в логе.

## Не делаем

- Никаких метрик/Sentry/алертинга, очередей писем, fire-and-forget нотификаций, distributed
  rate-limit (S-8), изменения формата ответов API.
