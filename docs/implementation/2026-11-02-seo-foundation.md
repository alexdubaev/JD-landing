# SEO crawl observation, 2026-11-02

## Scope

Owner approved proceeding with the SEO recovery plan, including safe observation
of real crawler requests. Allowed files: `deploy/Caddyfile`,
`deploy/seo-crawl-log.integration.py`, and this document.
No routing, TLS, authorization, environment, Compose, dependency, CMS schema,
frontend, lead processing or unrelated host changes.

## Behaviour and privacy

The deere-shop.ru site logs only GET/HEAD requests with YandexBot/Googlebot
User-Agent hints to public catalogue, article and selected service/SEO routes.
Human traffic, API routes, preview links, media and IndexNow key files are excluded.
All request headers, TLS details and response headers are removed; query strings
are stripped from the logged URI. Request bodies are never logged.

The private log retains remote IP only to verify reverse and forward DNS before
counting a real crawler. It is not proof based on User-Agent alone. Export only
sanitized paths/status/timing and aggregate verified crawler counts; never export
raw IPs or credentials into audit reports or Git.

Log path: `/data/deere-seo-access.log` in the existing private Caddy data volume,
mode 0600, rotation at 4 MiB or 24 hours, at most three rolled archives, maximum
rolled archive age 72 hours. Retention cleanup runs on rotation; an idle current
file is not a guarantee of strict deletion at exactly 72 hours.

## Verification and release

Run the existing deploy Node checks and the isolated Docker integration test
against the exact already running Caddy image. The integration exercises real
requests, sensitive-data canaries, host/method/path exclusions, file permissions
and SIGUSR1 reload with admin off and an unchanged container/start time.

Production currently starts Caddy with `run --config /etc/caddy/Caddyfile
--adapter caddyfile`, without --resume, with admin off. Verify these facts again
before applying a change. Preserve the entire live file and unrelated host blocks;
insert only the reviewed delimited logging block into the deere-shop.ru block.
Compare adapted candidate and original configs with only logging handlers removed
to ensure routing/headers/security configuration is unchanged.

Validate the full candidate before modifying the active file. Keep its original
file bytes for rollback, then use SIGUSR1 for a graceful reload. Do not restart
the shared proxy or deploy the frontend. Verify public and unrelated host HTTP
responses, unchanged container identities/start times, private file mode and the
sanitized log. A synthetic bot-like check must be labeled as such, not a real
YandexBot/Googlebot crawl. If activation fails, restore the original bytes and
reload the same way. Record the operation outside the repository.

Verification performed: 17 existing deploy Node checks passed. The isolated test
passed on the exact production Caddy 2.11.4 image: six accepted requests, seven
excluded requests, sensitive-data canaries absent, mode 0600, and successful
admin-off SIGUSR1 reload with the same container ID and start time. One independent
review found no confirmed defects. Frontend source is unchanged by this release;
no frontend deployment or unrelated application test rerun is required.

References: https://caddyserver.com/docs/caddyfile/directives/log,
https://caddyserver.com/docs/caddyfile/directives/log_skip,
https://caddyserver.com/docs/command-line#signals.
