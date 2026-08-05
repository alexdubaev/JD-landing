#!/usr/bin/env bash
# Production deploy with post-deploy ISR warm-up.
#
# WHY THIS EXISTS:
# Next.js ISR caches the homepage for `revalidate` seconds (300). If the
# frontend container renders the homepage while Directus is briefly
# unreachable (e.g. during a restart/redeploy), the "Каталог временно
# обновляется" stub gets cached and served to real users for up to 5 minutes.
# This script rebuilds, waits for Directus health, then forces a revalidate
# so the cached page always reflects live data.
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

echo "==> 4/4 Warming ISR cache (force homepage revalidate)..."
# Directus must answer before we prime the cache, otherwise the stub
# gets cached again. Retry for up to ~60s.
warmed=0
for i in $(seq 1 20); do
  directus_ok=$(sudo docker exec "$FRONTEND_CONTAINER" \
    sh -c "wget -qO- --timeout=5 http://directus:8055/server/ping 2>/dev/null || true")
  if [[ "$directus_ok" == "pong" ]]; then
    # Prime the page so it renders with real data, then purge via the API.
    sudo docker exec "$FRONTEND_CONTAINER" \
      sh -c "wget -qO- --timeout=10 http://127.0.0.1:3000/ >/dev/null 2>&1 || true"
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "https://deere-shop.ru/api/revalidate" \
      -H "x-revalidate-secret: $REVALIDATE_SECRET" \
      -H "Content-Type: application/json" \
      -d '{"collection":"homepage"}' 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
      echo "    revalidate OK (directus pong at attempt $i)"
      warmed=1
      break
    fi
  fi
  sleep 3
done

if [[ "$warmed" != "1" ]]; then
  echo "WARN: could not warm ISR cache; the homepage will self-heal within 300s." >&2
fi

echo "==> Verifying homepage is NOT serving the stub..."
stub=$(sudo docker exec "$FRONTEND_CONTAINER" \
  sh -c "wget -qO- --timeout=10 http://127.0.0.1:3000/ 2>/dev/null | grep -c 'Каталог временно обновляется' || true")
if [[ "$stub" != "0" ]]; then
  echo "ERROR: homepage is still showing the catalog stub after warm-up." >&2
  exit 1
fi
echo "    OK: homepage renders live content."

echo "==> Deploy complete."
