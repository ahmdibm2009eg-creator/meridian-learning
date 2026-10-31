#!/usr/bin/env bash
# Recreate the isolated TEST database from migrations + deterministic fixtures.
# Never touches db/custom.db (the development database).
set -euo pipefail
cd "$(dirname "$0")/.."
DB_PATH="$(pwd)/db/test.db"
export DATABASE_URL="file:${DB_PATH}"

rm -f "$DB_PATH"
bunx prisma migrate deploy
bun tests/fixtures/test-seed.ts
echo "Test database ready at ${DB_PATH}"
