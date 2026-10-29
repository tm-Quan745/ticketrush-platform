#!/bin/sh
set -eu

# Render exposes managed datastore URLs. Spring uses separate JDBC/Redis fields,
# so normalize those URLs here without persisting any credentials in the image.
if [ -z "${DB_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  case "$DATABASE_URL" in
    postgresql://*) export DB_URL="jdbc:$DATABASE_URL" ;;
    postgres://*) export DB_URL="jdbc:postgresql://${DATABASE_URL#postgres://}" ;;
    *) echo "DATABASE_URL must use a PostgreSQL URL" >&2; exit 64 ;;
  esac
fi

if [ -z "${REDIS_HOST:-}" ] && [ -n "${REDIS_URL:-}" ]; then
  redis_endpoint="${REDIS_URL#redis://}"
  redis_endpoint="${redis_endpoint##*@}"
  export REDIS_HOST="${redis_endpoint%%:*}"
  export REDIS_PORT="${redis_endpoint##*:}"
fi

exec java -Dserver.port="${PORT:-8080}" -jar /app/app.jar
