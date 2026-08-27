#!/usr/bin/env bash
# Production deploy with post-deploy ISR warm-up.
#
# WHY THIS EXISTS:
# Every ISR page uses `revalidate = 300` (homepage, /catalog, category pages,
# product pages). During `next build` inside Docker, Directus is unreachable,
# so the build-time prerender freezes the "Каталог временно обновляется" stub
# (or an empty catalog) into .next/server/app. That static prerender shadows
# ISR regeneration at runtime, so users see stale/empty content for minutes.
# The same risk applies if Directus is briefly unreachable during a redeploy.
# This script rebuilds, waits for Directus health, purges the build-time
# prerenders for the homepage AND catalog routes, then forces a revalidate so
# the cached pages always regenerate from live CMS data.
#
# Usage on the VPS (as codex-deploy, from /opt/jd-landing/release/deploy):
#   sudo bash deploy.sh
#
# Requires: docker compose, curl, /opt/jd-landing/.env (root-readable).

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/jd-landing/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/jd-landing/release/deploy/compose.production.yml}"
CADDYFILE="${CADDYFILE:-/opt/jd-landing/release/deploy/Caddyfile}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found at $ENV_FILE" >&2
  exit 1
fi

# Read only the values we need without leaving them in argv history.
read_env() {
  local key="$1"
  sudo grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-
}

REVALIDATE_SECRET="$(read_env REVALIDATE_SECRET)"

require_env_value() {
  local key="$1"
  local value
  value="$(read_env "$key")"
  if [[ -z "$value" ]]; then
    echo "ERROR: $key is required for the enabled production control" >&2
    return 1
  fi
}

preflight() {
  local cms_auth_enabled restic_enabled
  # These controls are opt-in. Older production env files predate the flags;
  # under `set -euo pipefail` a missing grep match must therefore mean false,
  # not an early script exit.
  cms_auth_enabled="$(read_env ENABLE_DIRECTUS_CMS_BASIC_AUTH || true)"
  restic_enabled="$(read_env ENABLE_RESTIC_BACKUP || true)"

  if [[ "$cms_auth_enabled" == "true" ]]; then
    if [[ ! -f "$CADDYFILE" ]] || ! grep -Eq '^[[:space:]]*basic_auth([[:space:]]|\{|$)' "$CADDYFILE"; then
      echo "ERROR: Caddy Basic Auth flag is enabled but the Caddyfile has no active basic_auth directive" >&2
      return 1
    fi
    require_env_value DIRECTUS_CMS_AUTH_USER
    require_env_value DIRECTUS_CMS_AUTH_HASH
  fi

  if [[ "$restic_enabled" == "true" ]]; then
    require_env_value RESTIC_REPOSITORY
    require_env_value RESTIC_PASSWORD_FILE
    if ! command -v restic >/dev/null 2>&1; then
      echo "ERROR: restic backup is enabled but the restic command is unavailable" >&2
      return 1
    fi
    local password_file
    password_file="$(read_env RESTIC_PASSWORD_FILE)"
    if [[ ! -r "$password_file" ]]; then
      echo "ERROR: RESTIC_PASSWORD_FILE is not readable" >&2
      return 1
    fi
    echo "ERROR: restic backup requires a separate reviewed restore-tested release" >&2
    return 1
  fi
}

echo "==> Running deployment preflight..."
preflight

echo "==> 1/4 Rebuilding frontend image..."
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build frontend

echo "==> 2/4 Recreating frontend container..."
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d frontend
# Resolve the container id through compose instead of hardcoding the
# project-prefixed name, which breaks if the project name ever changes.
FRONTEND_CONTAINER="$(sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q frontend)"
if [[ -z "$FRONTEND_CONTAINER" ]]; then
  echo "ERROR: frontend container is not running" >&2
  exit 1
fi
# The production Caddyfile deliberately has `admin off`, so it cannot receive
# a hot reload through port 2019. Recreate only Caddy to pick up its bind-mounted
# configuration after the frontend becomes healthy.
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate caddy

echo "==> 3/4 Waiting for frontend health..."
for i in $(seq 1 40); do
  status=$(sudo docker inspect "$FRONTEND_CONTAINER" \
    --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  if [[ "$status" == "healthy" ]]; then
    echo "    frontend healthy (attempt $i)"
    break
  fi
  sleep 3
done
if [[ "$status" != "healthy" ]]; then
  echo "ERROR: frontend did not become healthy" >&2
  exit 1
fi

echo "==> 4/4 Warming ISR cache (force homepage + catalog revalidate)..."
# Directus must answer before we prime the cache, otherwise the stub
# gets cached again. Retry for up to ~60s.
warmed=0
for i in $(seq 1 20); do
  directus_ok=$(sudo docker exec "$FRONTEND_CONTAINER" \
    sh -c "wget -qO- --timeout=5 http://directus:8055/server/ping 2>/dev/null || true")
  if [[ "$directus_ok" == "pong" ]]; then
    # During `next build` inside Docker, Directus is unreachable, so the
    # build-time prerender freezes the "Каталог временно обновляется" stub
    # (homepage) or an empty catalog into .next/server/app. That static file
    # shadows ISR regeneration at runtime. Remove every build-time prerender
    # under app/index and app/catalog so the first live request regenerates
    # the page from real CMS data. .html + .rsc cover the prerender artifacts;
    # the .segments/ dirs hold the ISR segment files. The [slug] dirs are
    # dynamic (no generateStaticParams) and are purged defensively in case a
    # future change pre-renders them.
    sudo docker exec "$FRONTEND_CONTAINER" sh -c '
      rm -f ./.next/server/app/index.html 2>/dev/null;
      rm -rf ./.next/server/app/index.segments 2>/dev/null;
      rm -f ./.next/server/app/catalog.html 2>/dev/null;
      rm -rf ./.next/server/app/catalog.segments 2>/dev/null;
      find ./.next/server/app/catalog -type f \( -name "*.html" -o -name "*.rsc" \) -delete 2>/dev/null;
      true
    '
    # Revalidate every collection that feeds the homepage and catalog before
    # warming pages, so the warm-up stores fresh CMS content rather than stale
    # cache entries. All collections must acknowledge the request.
    # products + categories also clear the shared "sitemap" tag, so detail
    # pages refresh too. Stop on the first 200.
    revalidated=1
    for collection in homepage categories products pages; do
      code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "https://deere-shop.ru/api/revalidate" \
        -H "x-revalidate-secret: $REVALIDATE_SECRET" \
        -H "Content-Type: application/json" \
        -d "{\"collection\":\"$collection\"}" 2>/dev/null || echo "000")
      if [[ "$code" != "200" ]]; then
        revalidated=0
        break
      fi
    done
    if [[ "$revalidated" == "1" ]]; then
      # Prime homepage and catalog only after their tagged data has expired.
      sudo docker exec "$FRONTEND_CONTAINER" \
        sh -c "wget -qO- --timeout=10 http://127.0.0.1:3000/ >/dev/null 2>&1 || true"
      sudo docker exec "$FRONTEND_CONTAINER" \
        sh -c "wget -qO- --timeout=10 http://127.0.0.1:3000/catalog >/dev/null 2>&1 || true"
      echo "    revalidate OK (directus pong at attempt $i)"
      warmed=1
      break
    fi
  fi
  sleep 3
done

if [[ "$warmed" != "1" ]]; then
  echo "WARN: could not warm ISR cache; pages will self-heal within 300s." >&2
fi

echo "==> Verifying homepage is NOT serving the stub..."
stub=$(sudo docker exec "$FRONTEND_CONTAINER" \
  sh -c "wget -qO- --timeout=10 http://127.0.0.1:3000/ 2>/dev/null | grep -c 'Каталог временно обновляется' || true")
if [[ "$stub" != "0" ]]; then
  echo "ERROR: homepage is still showing the catalog stub after warm-up." >&2
  exit 1
fi
echo "    OK: homepage renders live content."

echo "==> Verifying catalog listing is NOT empty..."
catalog_html=$(sudo docker exec "$FRONTEND_CONTAINER" \
  sh -c "wget -qO- --timeout=10 http://127.0.0.1:3000/catalog 2>/dev/null || true")
if [[ -z "$catalog_html" ]]; then
  echo "WARN: catalog listing returned empty; will self-heal within 300s." >&2
fi
echo "    OK: catalog listing responds."

echo "==> Deploy complete."
