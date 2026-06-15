#!/usr/bin/env bash
# Create the isolated test database (hrm_test) and apply migrations.
# Postgres runs in the hrm-postgres Docker container; the suite reads
# apps/api/.env.test (see vitest.config.ts). Wired as `pretest` so plain
# `npm test` always has a migrated test DB.
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_DB="hrm_test"
TEST_DATABASE_URL="postgresql://hrm:hrm_secret@localhost:5432/${TEST_DB}?schema=public"

if ! docker exec hrm-postgres psql -U hrm -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'" | grep -q 1; then
  echo "Creating database ${TEST_DB}..."
  docker exec hrm-postgres psql -U hrm -d postgres -c "CREATE DATABASE ${TEST_DB}"
fi

DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy
