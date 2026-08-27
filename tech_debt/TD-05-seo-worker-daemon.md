# TD-05 — seo-worker: daemon падает crash-loop'ом на первом отказе Directus

- **Приоритет:** P1 (один 5-секундный таймаут Directus останавливает SEO-конвейер молча; Node 20+ убивает процесс unhandled rejection'ом)
- **Усилие:** S (~2–3 ч с тестами)
- **Тип:** bug + tests
- **Зависимости:** нет.

## Симптом и влияние

`daemon.mjs` крутит `setInterval(() => scheduler.tick(), …)` без какого-либо `catch`. Под ним
`runShadowBatch` последовательно `await`-ит запросы к Directus без пер-элементной обработки ошибок.
Любой сетевой сбой/5xx/таймаут (клиентский таймаут 5с, `directus-client.mjs:51`) превращается в
unhandled rejection → процесс умирает → `restart: unless-stopped` поднимает его → через интервал
снова падает. В логах между рестартами — только startup-строка, ни слова об ошибке. SEO-фабрика
молча перестаёт работать, и узнаём об этом по дате последнего work item в Directus.

## Доказательство (file:line)

1. `seo-worker/src/daemon.mjs:16–18` — `setInterval(() => scheduler.tick(), intervalMs)`; в
   `createNonOverlappingScheduler` (`worker.mjs:15–27`) промис из `.finally()` никем не ловится;
   `.catch` в `daemon.mjs` отсутствует.
2. `seo-worker/src/worker.mjs:8–12` — `runShadowBatch`: `await client.getFactoryInputs(...)` и цикл
   `await client.upsertFactoryWorkItem(item)` — первый же отказ роняет весь батч.
3. `deploy/compose.production.yml:77` — `restart: unless-stopped` (превращает баг в crash-loop).
4. Тесты `cli` и `daemon` отсутствуют (`grep -r "daemon" seo-worker/test/` — пусто).

## Решение (минимальное)

1. `worker.mjs` — в `runShadowBatch` обернуть каждый `upsertFactoryWorkItem(item)` в try/catch:
   собирать `{ item, error: error.message }` в массив неудач, в конце `console.error` одной строкой
   (`shadow batch: N ok, M failed: ...`). `getFactoryInputs`-сбой остаётся наверх (это отказ всего
   батча — его ловит п.2).
2. `daemon.mjs` — обернуть вызов: `scheduler.tick().catch(err => console.error("[daemon] tick failed:",
   err?.message ?? err))`. Один place, ноль библиотек.
3. `seo-worker/package.json` — заменить ручной список файлов в `check`/`build` на glob
   (`node --check src/*.mjs scripts/*.mjs` — в npm-скриптах glob разворачивает shell; для
   кроссплатформенности можно оставить перечисление, но добавить проверку «все .mjs из src перечислены»
   простым тестом). Минимально: оставить как есть, если glob тянет проблемы с Windows-раннерами —
   не принципиально, пометить опциональным.

## TDD-план (`seo-worker/test/`, node:test, стиль соседних тестов)

1. Тест `worker.mjs`: клиент, у которого `upsertFactoryWorkItem` падает на 2-м из 3 items →
   `runShadowBatch` резолвится (не reject'ится), все 3 вызова состоялись, в stderr — сводка
   (перехватить console.error моком).
2. Тест `daemon.mjs`: экспортировать `startDaemon`/фабрику так, чтобы можно было подсунуть
   scheduler, чей `tick()` reject'ится → процесс не падает (assert: вызов `.catch`-логгера,
   интервал продолжает тикать). Для этого может понадобиться вынести создание интервала в
   инъектируемую функцию — минимальный рефакторинг на 5 строк.
3. Тест, что `getFactoryInputs`-rejection логируется, но не роняет демона.

## Подводные камни

1. Не добавлять retry/backoff/jitter — следующая итерация интервала и есть retry. Это анти-скоуп.
2. `console.error` в контейнере уходит в docker logs — этого достаточно; никакого логгера-библиотеки
   (пакет принципиально без зависимостей, `package.json` `dependencies: {}`).
3. При рефакторинге `daemon.mjs` не менять семантику «не перекрывать батчи»
   (`createNonOverlappingScheduler`) и не трогать `SEO_FACTORY_INTERVAL_MS` (недокументирован —
   добавить строку в `deploy/seo-factory.env.example` той же задачей, это одна строка документации).
4. Тесты не должны ставить реальные таймеры: использовать ручной «tick» вместо ожидания интервала.

## Allowed files (ADR-002)

- `seo-worker/src/daemon.mjs`, `seo-worker/src/worker.mjs`
- `seo-worker/test/worker.test.mjs` (новый), `seo-worker/test/daemon.test.mjs` (новый)
- `deploy/seo-factory.env.example` (строка про `SEO_FACTORY_INTERVAL_MS`)
- опционально `seo-worker/package.json` (check-glob)

## Верификация

1. `cd seo-worker && npm test`.
2. Локальный smoke: `DIRECTUS_URL=… SEO_WORKER_TOKEN=невалидный node src/daemon.mjs` — в консоли
   ошибка авторизации, процесс живёт, не рестартует.

## Не делаем

- Никаких библиотек логирования, алертов в Telegram, metrics-эндпоинтов, structured logging.
