#!/usr/bin/env sh
set -eu

project_dir="/opt/jd-landing"
backup_dir="${project_dir}/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
# The compose file ships with the release checkout (see deploy.sh), not in
# the project root — resolving it the same way keeps pg_dump from failing
# with "no configuration file found" before a backup is ever produced.
compose_file="${COMPOSE_FILE:-${project_dir}/release/deploy/compose.production.yml}"

install -d -m 700 "${backup_dir}"

cd "${project_dir}"

set -a
. ./.env
set +a

if [ "${ENABLE_RESTIC_BACKUP:-false}" = "true" ]; then
  echo "Restic backup requires a separate reviewed restore-tested release." >&2
  exit 1
fi

docker compose --env-file .env -f "${compose_file}" exec -T database \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
  > "${backup_dir}/directus-${timestamp}.dump"

# Fail the run when the dump is not a readable custom-format archive (empty
# file, truncated TOC) instead of silently archiving garbage. The TOC lives
# at the start of a custom archive, so pg_restore --list can stream it.
docker compose --env-file .env -f "${compose_file}" exec -T database \
  pg_restore --list /dev/stdin \
  < "${backup_dir}/directus-${timestamp}.dump" > /dev/null

docker run --rm \
  -v jd-landing_directus_uploads:/source:ro \
  -v "${backup_dir}:/backup" \
  alpine:3.22 \
  tar -czf "/backup/uploads-${timestamp}.tar.gz" -C /source .

ls -lh "${backup_dir}/directus-${timestamp}.dump" \
  "${backup_dir}/uploads-${timestamp}.tar.gz"

find "${backup_dir}" -type f -mtime +14 -delete
