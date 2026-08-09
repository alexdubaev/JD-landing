# Деплой на production (deere-shop.ru)

Единый ранбук: что деплоим, куда, как и что проверять после. Документ
собирает в одном месте всё, что раньше было размазано по `deploy/README.md`,
`HANDOFF.md` и комментариям в `deploy/deploy.sh`.

---

## 1. Что и где крутится

Один VPS, всё через Docker Compose (`deploy/compose.production.yml`):

| Сервис    | Образ                    | Назначение                                   |
|-----------|--------------------------|----------------------------------------------|
| database  | postgres:17-alpine       | БД Directus, приватная сеть `backend`        |
| directus  | directus/directus:12.1.1 | CMS, `cms.deere-shop.ru`, приватно + `web`   |
| frontend  | build `frontend/`        | Next.js standalone, `deere-shop.ru`          |
| caddy     | caddy:2-alpine           | Reverse proxy, TLS (80/443), `web`           |

Directus зафиксирован на `12.1.1`. Число кастомных коллекций намеренно
держится ниже лимита Core (25). Токен фронтенда — серверный, никогда не
попадает в `NEXT_PUBLIC_*`.

**Доступ:**
- VPS: `91.227.68.176` (Ubuntu 22.04), пользователь `codex-deploy`
- SSH: `ssh -i C:\Users\Elena\.ssh\jd_landing_deploy codex-deploy@91.227.68.176`
- Production-папка: `/opt/jd-landing`, релиз: `/opt/jd-landing/release`
- Реальный `.env`: `/opt/jd-landing/.env` (root-readable, **никогда не коммитить**)

---

## 2. Почему деплой ломал каталог (и что с этим сделали)

Главная и все страницы каталога используют ISR `revalidate = 300`:
`/`, `/catalog`, `/catalog/[categorySlug]`, `/catalog/[productSlug]`.

**Две причины «слёта», которые уже починены:**

1. **Сборка без Directus.** Во время `next build` внутри Docker Directus
   недоступен (`DIRECTUS_URL=http://127.0.0.1:9` — намеренно), поэтому
   build-time пререндер главной замораживал заглушку «Каталог временно
   обновляется» в `.next/server/app/index.html`. Этот статический файл
   перекрывал ISR-регенерацию в рантайме → страница висела «недоступной»
   бесконечно. *(коммит `12ad83a`)*
2. **Один `Promise.all` без catch.** Кратковременная недоступность
   Directus во время рестарта обнуляла всю главную и ISR кэшировал
   заглушку на 5 минут. *(коммит `a09f35b`)*

**Что сделано в коде:**
- `page.tsx` главной: критичная пара (`getHomePage` + `getSiteSettings`)
  отделена от остальных источников, каждый обёрнут в `.catch(() => [])`.

**Что делает `deploy/deploy.sh` (см. раздел 4):**
- ждёт, пока Directus ответит `pong`;
- **удаляет build-time пререндеры главной И каталога** (`index.html`,
  `catalog.html`, `*.rsc`, `.segments/` и всё под `app/catalog/`);
- прогревает `/` и `/catalog` живыми запросами;
- дёргает `/api/revalidate` для коллекций `homepage`, `categories`,
  `products`, `pages`;
- проверяет, что заглушки нет, а каталог отвечает.

---

## 3. Перед деплоем — обязательно локально

> Правило из `HANDOFF.md`: «Не выполнять deploy до локальной проверки».

```bash
cd frontend
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest run
npm run build       # локальная сборка Next.js
```

Если что-то из этого падает — деплой не делаем, чиним.

---

## 4. Процедура деплоя на VPS

Скрипт `deploy/deploy.sh` выполняет весь безопасный флоу. Запускать
только им, не вручную по шагам.

```bash
ssh -i C:\Users\Elena\.ssh\jd_landing_deploy codex-deploy@91.227.68.176
cd /opt/jd-landing/release/deploy
sudo bash deploy.sh
```

**Что делает скрипт (4 шага):**

1. `docker compose build frontend` — пересборка образа.
2. `docker compose up -d frontend` — пересоздание контейнера.
3. Ждёт healthcheck (до 40×3с), выходит с ошибкой если unhealthy.
4. **Прогрев ISR** (до 20×3с):
   - пингует Directus (`http://directus:8055/server/ping`) — пока не `pong`;
   - **чистит build-time пререндеры** главной и каталога:
     ```bash
     rm -f  ./.next/server/app/index.html
     rm -rf ./.next/server/app/index.segments
     rm -f  ./.next/server/app/catalog.html
     rm -rf ./.next/server/app/catalog.segments
     find ./.next/server/app/catalog -type f \( -name "*.html" -o -name "*.rsc" \) -delete
     ```
   - вызывает `POST /api/revalidate` для `homepage`, `categories`,
     `products`, `pages` (с заголовком `x-revalidate-secret`);
   - прогревает `/` и `/catalog` живыми запросами уже после инвалидации.

**Верификация в конце скрипта:**
- главная не содержит «Каталог временно обновляется» (иначе `exit 1`);
- `/catalog` отвечает непустым телом.

При неудаче скрипт пишет WARN: страницы self-heal в течение 300с, но
лучше разобраться.

---

## 5. Переменные окружения

Источник правды — `/opt/jd-landing/.env`. Шаблон со всеми переменными и
комментариями: `deploy/.env.production.example`.

**Обязательные (фронтенд, серверные):**
| Переменная                     | Назначение                                                |
|--------------------------------|-----------------------------------------------------------|
| `DIRECTUS_TOKEN`               | Static-токен роли «Frontend API» (≥20 символов), серверно |
| `DIRECTUS_PUBLIC_FOLDER_ID`    | UUID публичной папки Directus для абсолютных URL ассетов  |
| `REVALIDATE_SECRET`            | Секрет для `POST /api/revalidate`, проверяется заголовком |
| `NEXT_PUBLIC_SITE_URL`         | `https://deere-shop.ru` (зашивается в build)              |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (зашивается в build)      |
| `TURNSTILE_SECRET_KEY`         | Cloudflare Turnstile secret, проверяется в `/api/leads`   |

**БД / Directus:** `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`DIRECTUS_SECRET`, `DIRECTUS_ADMIN_EMAIL`, `DIRECTUS_ADMIN_PASSWORD`.

**Caddy/TLS:** `ACME_EMAIL`.

**Опциональные:**
- `SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM`, `NOTIFY_EMAIL_TO` —
  уведомления менеджеру о лидах. Без них лиды всё равно сохраняются.
- `INDEXNOW_KEY` — ускоряет переобход Yandex/Bing после правок в CMS.
  Тот же ключ нужно отдавать по `/<KEY>.txt` (положить в
  `frontend/public/`). Прокинут в `compose.production.yml`
  (`frontend.environment`); без значения пинги молча пропускаются.

> Никогда не коммитить реальный `.env`. Он должен существовать только в
> `/opt/jd-landing/.env`.

---

## 6. Git LFS — перед каждой сборкой образа

Логотип и hero-картинка в Git LFS. Перед сборкой Docker (иначе образ
получит pointer-файлы вместо картинок):

```bash
sudo apt-get update && sudo apt-get install -y git-lfs   # один раз
git lfs install
cd /opt/jd-landing/release
git lfs pull
```

---

## 7. Directus revalidation webhook (один раз + проверка)

CMS должна дёргать фронтенд при изменении коллекций, иначе ISR-страницы
обновляются не быстрее чем раз в 300с.

**Настройка в Directus (Settings → Webhooks):**
- URL: `https://deere-shop.ru/api/revalidate`
- Метод: `POST`
- Заголовок: `x-revalidate-secret: <значение REVALIDATE_SECRET>`
- Тело: `{"collection": "products"}` (аналогично для `categories`,
  `pages`, `page-sections`, `navigation-items`, `contact-channels`,
  `site-settings`, `recent-supplies`)

Без `REVALIDATE_SECRET` webhook открыт (任何人 может сбросить кэш) —
переменная обязательна.

---

## 8. Бэкапы

`deploy/backup.sh` пишет локально с удержанием 14 дней:
- `pg_dump` БД → `/opt/jd-landing/backups/directus-<ts>.dump`
- tar тома `directus_uploads` → `uploads-<ts>.tar.gz`

```bash
cd /opt/jd-landing/release/deploy
sudo bash backup.sh
```

> ⚠️ **Off-server бэкап пока не настроен** — это явный открытый пункт
> перед запуском. См. `deploy/README.md`.

---

## 9. Чек-лист после деплоя

- [ ] `deploy.sh` завершился без `exit 1` (нет «Каталог временно обновляется»).
- [ ] Главная `https://deere-shop.ru/` — hero и секции на месте.
- [ ] Каталог `https://deere-shop.ru/catalog` — товары грузятся, не пусто.
- [ ] Случайная категория и карточка товара открываются.
- [ ] Форма заявки отправляется (проверить в Directus → `leads`).
- [ ] `https://deere-shop.ru/sitemap.xml` и `/robots.txt` отдаются.
- [ ] `cms.deere-shop.ru` доступен, вход в Directus работает.
- [ ] Revalidation webhook настроен (раздел 7).
- [ ] Turnstile отображается в форме (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` +
      `TURNSTILE_SECRET_KEY` заданы — иначе капча молча отключена).

---

## 10. Откат

Образы не тегируются по версиям явно, поэтому откат = вернуть код в
`/opt/jd-landing/release` на предыдущий коммит и перезапустить скрипт:

```bash
cd /opt/jd-landing/release
git log --oneline -5            # выбрать прошлый рабочий коммит
git checkout <commit>
cd deploy
sudo bash deploy.sh
```

При проблемах с данными — восстановить из бэкапа (`deploy/backup.sh`).
