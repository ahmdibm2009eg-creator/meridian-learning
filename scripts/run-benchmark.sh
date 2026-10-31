#!/usr/bin/env bash
# Reproducible performance benchmark (isolated bench database, port 3998).
# Produces docs/benchmark-results.json. Never touches db/custom.db.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=3998
BASE="http://127.0.0.1:${PORT}"
BENCH_DB="$(pwd)/db/bench.db"

# 1. Fresh bench database from migrations
rm -f "$BENCH_DB"
DATABASE_URL="file:${BENCH_DB}" bunx prisma migrate deploy

# 2. Minimal fixtures (org, teacher, student, taxonomy)
DATABASE_URL="file:${BENCH_DB}" bun scripts/benchmark-fixtures.ts

# 3. Build if needed (clean cache to avoid stale Turbopack chunks)
if [ ! -f .next-test/BUILD_ID ]; then
  rm -rf .next-test/cache
  NEXT_DIST_DIR=1 bunx next build
fi

# 4. Start the server with query logging enabled for query counting
DATABASE_URL="file:${BENCH_DB}" NEXT_DIST_DIR=1 PORT="$PORT" HOSTNAME=127.0.0.1 \
  PRISMA_QUERY_LOG=1 bunx next start -p "$PORT" > tests/bench-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "$BASE/api/auth/me"; then echo "==> Bench server ready on :$PORT"; break; fi
  sleep 1
done

BENCH_DB_PATH="$BENCH_DB" BENCH_BASE_URL="$BASE" BENCH_SERVER_LOG="tests/bench-server.log" \
  DATABASE_URL="file:${BENCH_DB}" bun scripts/benchmark.ts
