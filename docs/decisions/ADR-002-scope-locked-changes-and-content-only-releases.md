# ADR-002: Scope-locked changes and content-only releases

## Status

Accepted — 2026-08-13.

## Context

The site combines a Next.js frontend, Directus CMS, a product catalogue and protected
server-side security settings. A full frontend deployment replaces the running
application image. Therefore an unrelated change that reaches the release branch can
affect a page or an integration outside the user's requested task.

The project owner requires a strict guarantee of intent: work on a hero block must not
alter the catalogue, security, infrastructure or unrelated pages. Content editors must
be able to update content without a code deployment.

## Decision

Every task is one of two modes. The mode and allowed surface must be stated before a
write or deployment.

### 1. Content-only mode (default for CMS editing)

- Change only the requested Directus item fields and explicitly requested files.
- Do not modify Git files, Directus schema, permissions, dependencies, Docker,
  environment variables, server configuration or frontend code.
- Do not rebuild or redeploy the Next.js application.
- Trigger revalidation only for the affected route or tag, then verify that route.
- Record the edited collection, item, fields and uploaded asset identifiers in the
  handoff.

Examples: hero title, hero image, category visibility, product description, SEO title.

### 2. Scoped integration mode (only when content cannot solve the task)

- Start with a written scope: requested behaviour, allowed files and fields, protected
  areas, and required verification routes.
- Before commit and before deployment, compare `git diff --name-only` with the allowed
  file list. Any unexpected file is a blocker: stop and ask the project owner; do not
  include it as a convenience fix.
- No change to permissions, secrets, authentication, security headers, Directus roles,
  schema, dependencies, Docker, deployment scripts or server configuration unless the
  owner explicitly requested that exact area.
- Deploy one reviewed commit, not an accumulation of unrelated work. The production
  checkout must be at that commit before the deployment command is run.
- Run the full local verification suite and the route checks named in the scope. A
  production deployment is incomplete until the public site is visually checked.

## Protected areas

Unless expressly included in the current task, these areas are read-only:

- security configuration, tokens, permissions and Directus roles;
- `deploy/`, Docker Compose, Caddy, environment files and VPS configuration;
- catalogue data model, products, categories and product routes;
- lead processing and notifications;
- all pages outside the requested route or component.

## Consequences

- A hero content update is a Directus-only operation and cannot publish unrelated code.
- A hero integration update still rebuilds the frontend application image, but its
  source diff is limited to the agreed hero integration surface and protected routes are
  checked before release.
- A request that needs a protected area requires separate explicit approval and a new
  scope; it is never silently bundled with a content task.
- Documentation alone cannot protect against a manual server change. Agents must follow
  this ADR and the mandatory project rules in `AGENTS.md`; future automation should
  reject releases whose file diff exceeds the declared scope.
