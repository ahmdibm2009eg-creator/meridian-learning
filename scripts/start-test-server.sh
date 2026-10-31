#!/usr/bin/env bash
# Prepare the test database/build and run the test server in the FOREGROUND
# (used by Playwright's webServer, which manages the process lifecycle).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${TEST_PORT:-3999}"
DB_PATH="$(pwd)/db/test.db"
export DATABASE_URL="file:${DB_PATH}"

bash scripts/reset-test-db.sh

if [ ! -f .next-test/BUILD_ID ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
  echo "==> Building production bundle into .next-test"
  rm -rf .next-test/cache
  NEXT_DIST_DIR=1 bunx next build
fi

exec env DATABASE_URL="$DATABASE_URL" NEXT_DIST_DIR=1 PORT="$PORT" HOSTNAME=127.0.0.1 \
  bunx next start -p "$PORT"
