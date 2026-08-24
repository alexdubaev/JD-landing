# Production deployment

The production stack runs on a single VPS:

- Caddy on public ports 80/443
- Directus on the private Docker network
- PostgreSQL on the private Docker network
- persistent volumes for the database, uploads, extensions, and TLS data

Directus is pinned to `12.1.1`. The project data model deliberately stays
below the Directus Core limit of 25 custom collections.

The CMS has 25 physical custom collections plus five schema-less navigation
folders. Its public policy is closed; the Next.js
container will use a server-only `Frontend API` account and must enforce
publication filters and lead validation. Directus tokens must never be exposed
through `NEXT_PUBLIC_*` variables.

The real `.env` file must exist only at `/opt/jd-landing/.env` on the VPS.
Never commit it.

## Git LFS media

The production logo and hero image are stored in Git LFS. Install Git LFS once
on the VPS and pull its objects before every image build; otherwise Docker sees
small pointer files instead of the actual image files.

```bash
sudo apt-get update && sudo apt-get install -y git-lfs
git lfs install
cd /opt/jd-landing/release
git lfs pull
```

The root domain and the server IP are reverse-proxied to the standalone
Next.js frontend. The frontend reaches Directus only through the private
Docker network and receives its API token as a server-only environment
variable.

Required frontend variables in `/opt/jd-landing/.env`:

```text
DIRECTUS_TOKEN=<Frontend API static token>
DIRECTUS_PUBLIC_FOLDER_ID=1ecf70c5-0ad4-4e5e-8d73-78ee549f064a
REVALIDATE_SECRET=<long random secret>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Cloudflare Turnstile site key>
TURNSTILE_SECRET_KEY=<Cloudflare Turnstile secret key>
```

The same `REVALIDATE_SECRET` is injected into Directus and the frontend.
Directus uses the private Docker URL `http://frontend:3000/api/revalidate` in
the managed flow, so CMS saves invalidate the Next.js cache immediately.

Configure both Turnstile variables together. The public site key is embedded at
image build time; the secret stays server-side and is used only by `/api/leads`.

Local backups are written to `/opt/jd-landing/backups` and retained for 14 days.
An off-server backup target is still required before launch.
