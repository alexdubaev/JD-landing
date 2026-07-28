# Production deployment

The production stack runs on a single VPS:

- Caddy on public ports 80/443
- Directus on the private Docker network
- PostgreSQL on the private Docker network
- persistent volumes for the database, uploads, extensions, and TLS data

The real `.env` file must exist only at `/opt/jd-landing/.env` on the VPS.
Never commit it.

The root domain currently serves a temporary launch notice. Replace that Caddy
route with `reverse_proxy frontend:3000` when the Next.js frontend service is
added.

Local backups are written to `/opt/jd-landing/backups` and retained for 14 days.
An off-server backup target is still required before launch.
