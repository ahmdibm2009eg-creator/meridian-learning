# Performance Report — Meridian Learning (Phase 2)

All numbers below are **measured**, not estimated. Reproduce with:

```bash
bun run bench    # scripts/run-benchmark.sh
```

Method: isolated `db/bench.db`, production build (`next start`, NODE_ENV=production),
requests over HTTP to 127.0.0.1:3998 from `scripts/benchmark.ts`. Question rows are
realistic (~120-char stems, 4-option JSON content, 1/4 IN_REVIEW, 1/3 taxonomy-mapped).
Latencies are p50/p95 over 20 runs (10 for attempt-start/analytics) after a warm-up
request. "Queries" = Prisma `prisma:query` log lines attributable to one request
(approximate, sequential requests).

## 1. Results at three scales

| Metric | 1,000 questions | 10,000 questions | 100,000 questions |
|---|---|---|---|
| SQLite file size | 788 KB | 4.7 MB | 44 MB |
| Question-bank list (page 1, 50/page) p50 / p95 | 17 / 51 ms | 25 / 41 ms | **171 / 218 ms** |
| Prisma queries per list request | 6 | 6 | 5 |
| Filtered list (type+status+search) p50 / p95 | 8 / 14 ms | 18 / 32 ms | 50 / 79 ms |
| Practice-set generation (adaptive, 20 q) p50 / p95 | 10 / 32 ms | 15 / 27 ms | 138 / 177 ms |
| Attempt start (25-item assessment) p50 | 6 ms | 6 ms | 7 ms |
| Autosave (10 answers per PATCH) p50 / p95 | 10 / 26 ms | 9 / 24 ms | 12 / 26 ms |
| Teacher analytics (item analysis) p50 | 9 ms | 6 ms | 8 ms |

Raw JSON: `docs/benchmark-results.json` (generated locally per run; gitignored).

## 2. Interpretation

- **The pagination added in this phase is what keeps the question bank usable at
  scale**: the API returns 50 rows + a total count (max page size 100) instead of the
  previous unbounded `take: 300` full-column fetch. At 100k questions the list is
  171 ms p50 — the cost is dominated by `ORDER BY createdAt DESC` + `skip` over
  un-indexed rows, not by payload size (payload is capped at 50 rows).
- **Autosave stays ~12 ms at 100k** because it writes only the touched answer rows
  with the revision guard (indexed by attempt/question).
- **Exam start, grading-adjacent and analytics paths are all < 10 ms p50** at every
  scale — they query by id/unique keys and never scan the question bank.
- **Practice-set generation (138 ms p50 @ 100k)** is the slowest student-facing path:
  it fetches mastery-ranked questions with taxonomy joins. Acceptable for a
  button-triggered action; a candidate for a covering index `(organizationId,
  reviewStatus, taxonomyNodeId)` if it regresses.

## 3. Changes made for performance in this phase

1. `/api/questions` GET: server-side pagination (`page`, `pageSize` ≤ 100, `total`,
   `hasMore`) + concurrent `findMany`/`count` (`Promise.all`).
2. `QuestionBankView`: incremental "Load more" (50/page) instead of relying on a
   300-row all-at-once payload; result counter shows `loaded / total`.
3. Prisma query logging made opt-in (`PRISMA_QUERY_LOG=1`) — removes per-query log
   overhead in production.

## 4. What was NOT measured (honest disclosure)

- **Initial page load / dashboard rendering** client-side metrics (FCP/LCP): the
  browser E2E suite exercises these flows functionally, but no synthetic timing
  harness (Lighthouse) is included in this environment. The API half of the dashboard
  (analytics/student) measures 6–9 ms p50 at all scales.
- **Memory usage**: no long-running soak test; the single benchmark server's RSS was
  stable within a run (no leak signal), but a formal memory profile is future work.
- **Mobile responsiveness** is covered functionally (320/640px reflow tests) but not
  with device-emulation performance metrics.
- 100,000 was the largest scale tested: it is the feasible ceiling for a
  single-file SQLite database in this architecture (44 MB file); PostgreSQL migration
  is the documented path beyond that.
