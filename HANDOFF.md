# Передача проекта JD Landing новому агенту

Актуально на: 28 июля 2026 года

Рабочая папка: `D:\codex\JD_landing`

## 1. Цель проекта

Нужно создать коммерческий сайт-каталог продукции John Deere для ООО «СМ ТЕХНО»:

- frontend: Next.js + TypeScript, App Router;
- CMS/админка: Directus;
- база Directus: PostgreSQL;
- визуальная основа: шаблон `https://github.com/di-sukharev/vibe`;
- ориентир на 300 товаров при запуске и масштабирование до 1000+;
- все важные тексты, контакты, товары, изображения, SEO и формы должны редактироваться через Directus;
- нельзя представлять компанию официальным дилером или представителем John Deere без отдельного подтверждения владельца.

Полные требования находятся в `AGENTS.md`. Перед любой разработкой обязательно прочитать его полностью.

## 2. Данные компании

- Компания: ООО «СМ ТЕХНО»
- Телефон: +7 (812) 468-82-99
- Email: info@cmteh.ru
- Местонахождение: Санкт-Петербург
- Регион работы и доставки: вся Россия
- ИНН: 7804702073
- КПП: 780401001
- ОГРН: 1237800071410
- Юридический адрес: 195009, Санкт-Петербург, Кондратьевский пр., д. 2, к. 4, лит. А, пом./офис 10Н/704/1

Исходный документ:

`D:\YandexDisk\Саша\СМ ТЕХНО\Документы\Карточка компании.pdf`

## 3. Репозиторий и Git

- GitHub: `https://github.com/alexdubaev/JD-landing`
- Remote в локальном репозитории использует HTTPS.
- Рабочая ветка: `agent/production-infrastructure`
- Ветка отслеживает соответствующую ветку в `origin`.
- Draft PR: `https://github.com/alexdubaev/JD-landing/pull/1`
- Базовая ветка PR: `main`
- Последний опубликованный инфраструктурный коммит до этого файла: `6b2eb36 Add production infrastructure`
- Репозиторий публичный: секреты и персональные учетные данные в Git не добавлять.
- Для бинарных товарных данных и изображений используется Git LFS.

Владелец проекта просил все изменения выгружать в этот репозиторий. Перед отправкой всегда проверять `git status`, diff и отсутствие секретов.

## 4. Товарные данные

Исходники:

`D:\codex\JD_landing\data\price`

В исходниках было 26 XLSX-файлов и 26 ZIP-архивов с JPG.

Готовый результат:

- папка: `D:\codex\JD_landing\outputs\jd-product-import-2026-07-28`
- архив: `D:\codex\JD_landing\outputs\jd-product-import-2026-07-28.zip`
- товаров: 299;
- изображений: 1251;
- товаров без изображений: 16;
- отсутствующих упомянутых изображений: 0;
- дубликатов SKU: 0;
- товаров без описания или цены: 0.

Эти данные нужно использовать для последующего импорта товаров, описаний, цен и изображений в Directus. Не выдумывать цены, SKU и характеристики, которых нет в исходных данных.

## 5. VPS

- Публичный IP: `91.227.68.176`
- ОС: Ubuntu 22.04
- Конфигурация: 2 CPU, 4 GB RAM, 40 GB SSD
- Установлены Docker и Portainer.
- Пользователь деплоя: `codex-deploy`
- Локальный приватный ключ: `C:\Users\Elena\.ssh\jd_landing_deploy`
- SSH-доступ настроен по ключу.
- Вход root и вход по паролю через SSH отключены.
- Firewall разрешает TCP 22, TCP 80, TCP/UDP 443.
- Включен Fail2ban.
- Добавлен swap 2 GB.
- Часовой пояс сервера: Europe/Moscow.
- Автоматические обновления безопасности включены.
- Старый проект с VPS удален.

Пример безопасного подключения:

```powershell
ssh -i C:\Users\Elena\.ssh\jd_landing_deploy codex-deploy@91.227.68.176
```

Не выводить в терминал содержимое приватного ключа, `.env` и файла с учетными данными.

## 6. Production-инфраструктура

Файлы инфраструктуры в репозитории:

- `deploy/compose.production.yml`
- `deploy/Caddyfile`
- `deploy/.env.production.example`
- `deploy/backup.sh`
- `deploy/README.md`

Папка развертывания на VPS:

`/opt/jd-landing`

Запущенные сервисы:

- `jd-landing-database-1` — PostgreSQL 17 Alpine, доступен только внутри Docker-сети;
- `jd-landing-directus-1` — Directus 12.1.1;
- `jd-landing-caddy-1` — Caddy 2 Alpine;
- `portainer` — существующий Portainer, сохранен отдельно.

Portainer привязан только к `127.0.0.1:9000`; публичный порт 9000 недоступен.

Секретные файлы на VPS:

- `/opt/jd-landing/.env`, права `600`;
- `/opt/jd-landing/admin-credentials.txt`, права `600`.

Второй файл содержит адрес, email и текущий пароль администратора Directus. Его значения нельзя копировать в Git, этот документ, чат или вывод диагностики.

Во время прежней диагностики старые секреты однажды попали в технический вывод. После этого пароль PostgreSQL, секрет Directus и пароль администратора Directus были заменены. Текущие значения на VPS уже новые и действующие.

Резервные копии:

- каталог: `/opt/jd-landing/backups`;
- cron: `/etc/cron.d/jd-landing-backup`;
- запуск ежедневно в 02:30;
- локальное хранение: 14 дней;
- тестовые резервные копии создавались успешно.

Обязательно остается настроить внешнюю копию резервных данных за пределами VPS.

## 7. Домен и DNS

Основной домен: `deere-shop.ru`

Регистратор и DNS-панель: REG.RU

Добавлены записи:

- `A @` → `91.227.68.176`
- `A cms` → `91.227.68.176`
- `CNAME www` → `deere-shop.ru.`

На момент создания документа записи еще распространялись неравномерно между авторитетными серверами REG.RU:

- корневой домен уже отвечал;
- `cms` и `www` могли временно возвращать NXDOMAIN на одном из серверов;
- `https://deere-shop.ru` уже открывался с сертификатом Let’s Encrypt;
- `https://cms.deere-shop.ru` и `https://www.deere-shop.ru` еще ожидали полной DNS-пропагации и выдачи сертификатов.

Caddy самостоятельно повторяет попытки выпуска сертификатов. После полной DNS-пропагации нужно проверить все три адреса и при необходимости перезапустить Caddy.

## 8. Временный доступ без домена

Сайт уже доступен напрямую:

`http://91.227.68.176`

Сейчас там техническая заглушка, а не готовый frontend.

Directus не выставлен открытым по IP. В production compose добавлена безопасная локальная привязка:

`127.0.0.1:8055:8055`

Для доступа к админке без ожидания DNS нужно создать SSH-туннель с компьютера пользователя:

```powershell
ssh -i C:\Users\Elena\.ssh\jd_landing_deploy `
  -o BatchMode=yes `
  -o ExitOnForwardFailure=yes `
  -o ServerAliveInterval=30 `
  -N `
  -L 127.0.0.1:8055:127.0.0.1:8055 `
  codex-deploy@91.227.68.176
```

Пока эта команда работает, админка доступна по адресу:

`http://localhost:8055/admin`

Для фонового запуска через PowerShell использовать `Start-Process` с `-WindowStyle Hidden`. На момент передачи проекта локальный SSH-туннель еще не был успешно запущен.

## 9. Статус Directus

- Directus развернут и контейнер проходит healthcheck.
- Вход администратора проверялся успешно.
- Email администратора: `info@cmteh.ru`
- Текущий пароль хранится только в `/opt/jd-landing/admin-credentials.txt`.
- Коллекции, роли, права и импорт 299 товаров еще не выполнены.

Нужно создать коллекции и роли строго по `AGENTS.md`, включая:

- `site_settings`
- `navigation_items`
- `hero_blocks`
- `categories`
- `products`
- `product_images`
- `product_specifications`
- `product_documents`
- `advantages`
- `cta_blocks`
- `faq_items`
- `contact_channels`
- `lead_forms`
- `leads`
- `seo_pages`
- `seo_text_blocks`
- `pages`
- `testimonials`
- `banners`

## 10. Статус frontend

Готовый Next.js frontend еще не реализован. По IP и основному домену показывается техническая заглушка.

Шаблон Vibe был изучен из локальной копии:

`D:\codex\JD_landing\.codex-tmp\vibe-upstream`

Текущий upstream Vibe — Bun-монорепозиторий:

- публичный сайт на Astro;
- webapp на Vite + React;
- backend на Hono;
- PostgreSQL.

Требования проекта прямо требуют Next.js. Принято решение не переносить стек Vibe целиком, а сохранить и адаптировать его полезные визуальные, компонентные и анимационные паттерны в Next.js App Router.

Основные маршруты из `AGENTS.md`:

- `/`
- `/catalog`
- `/catalog/[categorySlug]`
- `/catalog/[categorySlug]/[productSlug]`
- `/about`
- `/delivery`
- `/contacts`
- `/privacy-policy`
- `/thank-you`

## 11. Что делать дальше

Приоритетный порядок:

1. Прочитать `AGENTS.md` полностью и проверить `git status`.
2. Запустить локальный SSH-туннель и убедиться, что открывается `http://localhost:8055/admin`.
3. Проверить распространение DNS и HTTPS:
   - `https://deere-shop.ru`
   - `https://www.deere-shop.ru`
   - `https://cms.deere-shop.ru`
4. Создать в Directus коллекции, связи, роли и права из `AGENTS.md`.
5. Подготовить и выполнить импорт 299 товаров, цен, описаний и изображений.
6. Создать Next.js App Router frontend с адаптацией визуальных паттернов Vibe.
7. Подключить frontend к Directus только через серверный слой.
8. Реализовать каталог, карточки, фильтры, поиск, формы заявок, SEO, sitemap, robots и JSON-LD.
9. Заменить техническую заглушку в production на собранный frontend.
10. Настроить внешний backup, уведомления, Яндекс Метрику и контроль ошибок.
11. Проверить мобильную версию, формы, SEO, производительность и безопасность.

## 12. Быстрые проверки

Локальный Git:

```powershell
Set-Location D:\codex\JD_landing
git status --short --branch
git log -5 --oneline
git remote -v
```

Состояние контейнеров:

```powershell
ssh -i C:\Users\Elena\.ssh\jd_landing_deploy codex-deploy@91.227.68.176 `
  "cd /opt/jd-landing && sudo docker compose -f compose.production.yml ps"
```

Проверка сайта по IP:

```powershell
curl.exe -I http://91.227.68.176
```

Проверка Directus после запуска туннеля:

```powershell
curl.exe http://127.0.0.1:8055/server/ping
```

Проверка доменов:

```powershell
Resolve-DnsName deere-shop.ru
Resolve-DnsName www.deere-shop.ru
Resolve-DnsName cms.deere-shop.ru
curl.exe -I https://deere-shop.ru
curl.exe -I https://www.deere-shop.ru
curl.exe -I https://cms.deere-shop.ru
```

## 13. Правила безопасности для следующего агента

- Никогда не публиковать содержимое `/opt/jd-landing/.env`.
- Никогда не публиковать содержимое `/opt/jd-landing/admin-credentials.txt`.
- Никогда не публиковать содержимое приватного SSH-ключа.
- Не открывать PostgreSQL, Directus или Portainer напрямую в интернет без необходимости.
- Не удалять Portainer.
- Перед удалением или очисткой проверять точный абсолютный путь.
- Не перезаписывать пользовательские изменения в рабочем дереве.
- Не добавлять в Git реальные пароли, токены, ключи или резервные копии.
- Перед каждым push проверять staged diff и выполнять поиск потенциальных секретов.
- Не заявлять официальный статус по отношению к John Deere без подтверждения владельца.

## 14. Критерий ближайшего успешного этапа

Ближайший этап можно считать завершенным, когда:

- DNS и SSL работают для корня, `www` и `cms`;
- Directus доступен через `https://cms.deere-shop.ru`;
- коллекции и роли Directus созданы;
- товарные данные импортированы и проверены;
- базовый Next.js frontend получает контент из Directus;
- production-сайт открывается на `https://deere-shop.ru`;
- все изменения находятся в GitHub PR №1 без секретов.
