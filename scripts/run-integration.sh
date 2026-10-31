#!/usr/bin/env bash
# Full API integration suite against an isolated test database:
#   reset test db → build (if needed) → start server → vitest → teardown.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${TEST_PORT:-3999}"
BASE="http://127.0.0.1:${PORT}"
DB_PATH="$(pwd)/db/test.db"
export DATABASE_URL="file:${DB_PATH}"

bash scripts/reset-test-db.sh

if [ ! -f .next-test/BUILD_ID ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
  echo "==> Building production bundle into .next-test"
  rm -rf .next-test/cache
  NEXT_DIST_DIR=1 bunx next build
fi

echo "==> Starting test server on :${PORT}"
DATABASE_URL="$DATABASE_URL" NEXT_DIST_DIR=1 PORT="$PORT" HOSTNAME=127.0.0.1 \
  bunx next start -p "$PORT" > tests/server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

for i in $(seq 1 60); do
  if curl -sf -o /dev/null "$BASE/api/auth/me"; then echo "==> Server ready"; break; fi
  sleep 1
done

echo "==> Running integration tests"
TEST_BASE_URL="$BASE" DATABASE_URL="$DATABASE_URL" bunx vitest run tests/integration
