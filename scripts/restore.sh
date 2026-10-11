#!/bin/sh
set -eu
if [ "$#" -ne 1 ] || [ "${CONFIRM_RESTORE:-}" != 'replace-this-salon' ]; then
  echo 'Uso: CONFIRM_RESTORE=replace-this-salon [ENV_FILE=.env] scripts/restore.sh backups/archivo.dump' >&2
  echo 'Reemplaza los datos de ESTA instalación. Detén backend y frontend; conserva un backup previo.' >&2
  exit 1
fi
[ -f "$1" ] || exit 1
env_file="${ENV_FILE:-.env}"
[ -f "$env_file" ] || { echo "No existe $env_file" >&2; exit 1; }
docker compose --env-file "$env_file" exec -T postgres pg_restore -U postgres -d salon --clean --if-exists --single-transaction < "$1"
