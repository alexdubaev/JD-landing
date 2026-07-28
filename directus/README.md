# Directus development tooling

Local Directus is pinned to `12.1.1`.

```powershell
docker compose up -d
npm test
npm run schema:check
npm run schema:apply
npm run access:apply
npm run schema:snapshot
npm run products:import -- --dry-run
npm run products:import -- --status=draft
```

`schema:apply` and `access:apply` are idempotent. They require either
`DIRECTUS_TOKEN` or `DIRECTUS_ADMIN_EMAIL` plus
`DIRECTUS_ADMIN_PASSWORD` in the process environment. Do not commit real
credentials or tokens.

Files:

- `schema/blueprint.mjs` — source of truth for the 12 custom collections;
- `schema/apply-schema.mjs` — idempotent schema installer;
- `schema/snapshot.json` — generated Directus snapshot;
- `access/blueprint.mjs` — Directus 12 Core-compatible roles and policies;
- `access/apply-access.mjs` — idempotent access installer.
- `import/products.mjs` — validates and idempotently imports the prepared 299
  products, their categories, and images. Imports are drafts unless
  `--status=published` is explicitly supplied.

The public Directus policy is intentionally closed. Only a server-side Next.js
client may use the `Frontend API` role. See
[`../DIRECTUS_COLLECTIONS_PLAN.md`](../DIRECTUS_COLLECTIONS_PLAN.md) for the
license constraints and security boundaries.
