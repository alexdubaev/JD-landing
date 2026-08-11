#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-/opt/jd-landing/.env}"
[ -r "$ENV_FILE" ] || { echo "Missing readable env file: $ENV_FILE" >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

project_dir="/opt/jd-landing"
backup_dir="${project_dir}/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 700 "${backup_dir}"

cd "${project_dir}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

docker compose --env-file .env -f compose.production.yml exec -T database \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
  > "${tmp_dir}/directus-${timestamp}.dump"

docker run --rm \
  -v jd-landing_directus_uploads:/source:ro \
  -v "${tmp_dir}:/backup" \
  alpine:3.22 \
  tar -czf "/backup/uploads-${timestamp}.tar.gz" -C /source .

restic backup "${tmp_dir}" --tag jd-landing --tag "${timestamp}"
restic forget --keep-daily 90 --prune

find "${backup_dir}" -type f -mtime +14 -delete
