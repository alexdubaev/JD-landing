# TD-01 — CI-конвейер: тесты всех пакетов на каждый push/PR

- **Приоритет:** P1 (фундамент для всех остальных задач — без CI любой TDD-рефакторинг держится на честном слове)
- **Усилие:** S (~2–4 ч)
- **Тип:** infra
- **Зависимости:** нет. Блокирует надёжное выполнение TD-02, TD-08, TD-09, TD-10, TD-12.

## Симптом и влияние

В репозитории нет никакого CI: нет `.github/workflows/`, нет другого пайплайна. Тесты запускаются
только вручную и по-разному в разных пакетах:

| Пакет | Тесты | Команда |
|---|---|---|
| `frontend/` | vitest | `npm test` (плюс `npm run lint`, `npm run typecheck`) |
| `seo-worker/` | node:test | `npm test` |
| `directus/` | node:test | `npm test` |
| `deploy/*.test.mjs` + `scripts/validate-import.test.mjs` | node:test | **не принадлежат ни одному package.json** — запускаются только если кто-то помнит `node --test deploy/ scripts/` из корня |

Последствия:
- ADR-002 требует перед каждым релизом «run the declared checks» — сегодня это полностью ручная
  дисциплина, один забытый `npm test` в `seo-worker` уезжает в прод.
- ADR-002 прямо называет будущую автоматизацию проверки скоупа релиза (`docs/decisions/ADR-002-...md`,
  финальный раздел) — без CI ей неоткуда вырасти.
- Тесты `deploy/` (строковые проверки deploy.sh/backup.sh/Caddyfile) не запускаются никем routinely.

## Решение (минимальное)

Один workflow-файл `.github/workflows/ci.yml`, два job'а, без матриц, без сборки Next-приложения
(сборка требует Directus — не для CI), без coverage-порогов:

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
        working-directory: frontend
      - run: npm run lint
        working-directory: frontend
      - run: npm run typecheck
        working-directory: frontend
      - run: npm test
        working-directory: frontend
  node-packages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm test
        working-directory: seo-worker
      - run: npm test
        working-directory: directus
      - run: node --test deploy/ scripts/
```

Оба пакета (`seo-worker`, `directus`) объявляют `"test": "node --test"` с автодискавери и не имеют
зависимостей (`dependencies: {}`) — `npm ci` им не нужен. `deploy/` и `scripts/` — тесты без пакета,
запускаем node напрямую из корня.

## Подводные камни

1. **Тесты frontend могут требовать env.** Vitest-тесты мокают fetch, но если какой-то тест импортирует
   модуль, валидирующий env через zod на верхнем уровне (`lib/directus/env.ts`), запуск упадёт.
   Проверить локально с чистым env: `env -i npm test` в `frontend/`. Если падает — добавить в workflow
   фейковые `DIRECTUS_URL` / `DIRECTUS_TOKEN` (минимально валидные значения), а не пропускать job.
2. **`node --test deploy/ scripts/`** подхватит `scripts/validate-import.test.mjs` — ок. Убедиться, что
   в `scripts/` нет других `*.test.mjs`, тянущих внешние зависимости (их нет на момент написания).
3. **Windows-разработчик**: команды в workflow под linux-раннером — локально у владельца Git Bash,
   путаницы с `\` не будет, но не добавлять PowerShell-специфику.
4. Не включать `npm run build` frontend в CI (нет CMS → сборка упадёт на data-фечах, это отдельная
   история про build-time env — не наша задача).

## Allowed files (ADR-002)

- `.github/workflows/ci.yml` (новый)

Опционально тем же коммитом: одна строка в `AGENTS.md` (раздел про проверки) с командой полного
локального прогона. Если не хочется трогать AGENTS.md — записать команду в `tech_debt/README.md`.

## Верификация

1. Открыть вкладку Actions после пуша: оба job'а зелёные на `main`.
2. Временный коммит с заведомо сломанным тестом в `seo-worker` на ветке → PR красный → revert.
   (Достаточно убедиться один раз, что workflow реально блокирует.)

## Не делаем (анти-скоуп)

- Никакого CD/автодеплоя, матриц версий, coverage-порогов, lint для .mjs-скриптов, Docker-сборки
  в CI, проверки скоупа диффа автоматически (это отдельная будущая задача после ADR-002).
