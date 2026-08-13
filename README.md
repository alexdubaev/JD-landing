# JD Landing

Landing page and product catalog for John Deere-related products and parts.

## Planned stack

- Next.js and TypeScript
- Directus
- PostgreSQL
- Docker Compose

## Local Directus

1. Copy `directus/.env.example` to `directus/.env`.
2. Replace all placeholder passwords and secrets.
3. Run:

```powershell
cd directus
docker compose up -d
```

Directus will be available at `http://localhost:8055`.

## Client-friendly CMS

Directus Studio is organized in Russian into five task groups: «Сайт»,
«Каталог», «Контент», «Продажи», and «Настройки». The homepage is a singleton:
an editor changes the hero title, image, buttons, search copy, sections, and SEO
from one screen. Technical collections are hidden from normal navigation.

The editor workflow is documented in
[`docs/implementation/directus-client-workflow.md`](docs/implementation/directus-client-workflow.md).
After an editor saves public content, a managed Directus Flow immediately
revalidates the Next.js cache.

## Product data

- Original price lists and image archives are stored in `data/price`.
- Prepared XLSX, CSV, JSON, and image imports are stored in `outputs/jd-product-import-2026-07-28`.
- Large binary files are managed with Git LFS.

Do not position the website as an official John Deere representative unless that status is explicitly confirmed.
