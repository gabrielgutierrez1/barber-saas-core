#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$DATABASE_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE salon_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password') \gexec
ALTER DATABASE salon OWNER TO salon_app;
ALTER SCHEMA public OWNER TO salon_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
