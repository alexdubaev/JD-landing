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

## Product data

- Original price lists and image archives are stored in `data/price`.
- Prepared XLSX, CSV, JSON, and image imports are stored in `outputs/jd-product-import-2026-07-28`.
- Large binary files are managed with Git LFS.

Do not position the website as an official John Deere representative unless that status is explicitly confirmed.
