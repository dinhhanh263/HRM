#!/usr/bin/env bash
# Create the isolated test database (hrm_test) and apply migrations.
# Talks to a local PostgreSQL server at $PG_HOST:$PG_PORT (originally this
# assumed a `hrm-postgres` Docker container; it now uses a local server so it
# works with Homebrew/native Postgres too). Wired as `pretest` so plain
# `npm test` always has a migrated test DB. The suite reads apps/api/.env.test.
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_DB="hrm_test"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_SUPER_URL="${PG_SUPER_URL:-postgresql://hrm:hrm_secret@${PG_HOST}:${PG_PORT}/postgres}"
TEST_DATABASE_URL="postgresql://hrm:hrm_secret@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public"

# Prefer a Postgres 16 client if present (Homebrew keg is not linked by default).
PSQL="psql"
for c in /opt/homebrew/opt/postgresql@16/bin/psql /usr/local/opt/postgresql@16/bin/psql; do
  [ -x "$c" ] && PSQL="$c" && break
done

if ! "$PSQL" "$PG_SUPER_URL" -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -q 1; then
  echo "Creating database ${TEST_DB}..."
  "$PSQL" "$PG_SUPER_URL" -c "CREATE DATABASE ${TEST_DB}"
fi

DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy
