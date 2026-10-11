#!/bin/sh
set -eu
umask 077
# Varias instalaciones en el mismo host: ENV_FILE=.env.otro scripts/backup.sh
env_file="${ENV_FILE:-.env}"
[ -f "$env_file" ] || { echo "No existe $env_file" >&2; exit 1; }
mkdir -p backups
prefix=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$env_file" | tail -n 1 | tr -cd 'A-Za-z0-9_-')
file="backups/${prefix:-salon}-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Failures leave only a .partial file, never an apparently valid backup.
docker compose --env-file "$env_file" exec -T postgres pg_dump -U postgres -d salon -Fc > "$file.partial"
mv "$file.partial" "$file"
printf 'Backup creado: %s\n' "$file"
