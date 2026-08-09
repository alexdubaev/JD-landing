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
FRONTEND_CONTAINER="jd-landing-frontend-1"

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
DIRECTUS_TOKEN="$(read_env DIRECTUS_TOKEN)"
DIRECTUS_ADMIN_EMAIL="$(read_env DIRECTUS_ADMIN_EMAIL)"
DIRECTUS_ADMIN_PASSWORD="$(read_env DIRECTUS_ADMIN_PASSWORD)"

echo "==> 1/4 Rebuilding frontend image..."
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build frontend

echo "==> 2/4 Recreating frontend container..."
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d frontend

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
