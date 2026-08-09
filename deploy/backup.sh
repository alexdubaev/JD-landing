#!/usr/bin/env sh
set -eu

project_dir="/opt/jd-landing"
backup_dir="${project_dir}/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 700 "${backup_dir}"

cd "${project_dir}"

set -a
. ./.env
set +a

docker compose --env-file .env -f compose.production.yml exec -T database \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
  > "${backup_dir}/directus-${timestamp}.dump"

docker run --rm \
  -v jd-landing_directus_uploads:/source:ro \
  -v "${backup_dir}:/backup" \
  alpine:3.22 \
  tar -czf "/backup/uploads-${timestamp}.tar.gz" -C /source .

find "${backup_dir}" -type f -mtime +14 -delete
