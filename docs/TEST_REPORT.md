# Test Report — Meridian Learning (Phase 2)

Last full run: 2026-10-31 · **202 automated checks, all passing**
(56 unit + 111 API integration + 35 browser E2E/accessibility).

## 1. How to run everything

```bash
bun install && bunx prisma generate

bun run lint             # ESLint (clean)
bun run typecheck        # tsc --noEmit (clean)
bun run test             # 56 unit tests (< 1 s, no server needed)
bun run test:integration # 111 API tests: resets db/test.db, builds .next-test,
                         #   boots `next start` on :3999, runs Vitest, tears down
bun run test:e2e         # 35 Playwright tests (browser E2E + axe-core) on :3999
bun run test:all         # all of the above sequentially
bun run bench            # performance benchmark → docs/benchmark-results.json
```

CI runs the same sequence on every push/PR (`.github/workflows/ci.yml`). The build
fails when any test fails; nothing is skipped to obtain a passing result.

**Isolation guarantees:** unit tests use `db/vitest-scratch.db`; integration/E2E tests
use `db/test.db` (recreated from migrations + deterministic fixtures by
`scripts/reset-test-db.sh`); benchmarks use `db/bench.db`. The development database
(`db/custom.db`) is never touched by any test. Fixtures (`tests/fixtures/test-seed.ts`)
use fixed ids and upserts; suites run sequentially (`fileParallelism: false`) because
they share the test database.

## 2. Results matrix

Legend: ✅ tested & passed · ❌ tested & failed (none at time of writing) · ⬜ not tested · ⛔ blocked by environment.

### A. Authentication (integration, 15 checks) — ✅

| Requirement | Status | Test |
|---|---|---|
| Valid login (cookie + /me) | ✅ | auth.test.ts |
| Invalid password / unknown email / suspended account | ✅ | auth.test.ts |
| Logout revokes session server-side | ✅ | auth.test.ts |
| Session persistence across requests | ✅ | auth.test.ts |
| Unauthorized access on 10 protected endpoints | ✅ | auth.test.ts |
| Session expiration | ⬜ | Not directly testable without clock control; expiry check + GC are covered by unit-level code paths and the suspend-revocation test (same code path deletes sessions) |
| Session revocation by admin suspend | ✅ | auth.test.ts |
| Role-specific authorization (admin-only surfaces) | ✅ | security.test.ts |
| Disabled accounts blocked at login AND at session read | ✅ | auth.test.ts (suspended login 403; suspension kills live sessions) |
| Brute-force lockout (11th failure → 429, other emails unaffected) | ✅ | auth.test.ts |
| Registration cannot self-escalate to TEACHER | ✅ | auth.test.ts (REGRESSION tag) |

### B. Multi-tenant isolation (integration, 16 checks) — ✅

Cross-org access attempted with **direct object ids** (not navigation) across courses,
sections, lessons, assignments, questions, assessments, attempts, announcements, audit,
admin lists, analytics, vocab, taxonomy, enrollment — all rejected. Includes the six
P0 write-route regressions and the audit-log scoping regression. Org A ⇄ Org B both
directions; SUPER_ADMIN sees all, ORG_ADMIN only their org.

### C. Course workflow (integration + browser) — ✅

Teacher create → section → lessons → publish → student enrolls → opens lesson →
completes → progress updates → teacher roster view. Persistence across fresh GETs and
across full page reloads (browser). Completion idempotence (double-complete → exactly
one gradebook entry). Enrollment dedup. Unenrolled students blocked.

### D. Question bank (integration, 16 checks) — ✅

All 9 types create/validate/edit/version (revision snapshot verified in DB);
review-status workflow with invalid values rejected; import dedup/flag/IN_REVIEW;
delete guarded when used by assessments; cross-org taxonomy/passage rejected;
pagination (page/pageSize/total/hasMore, clamped); student detail view leaks nothing
(REGRESSION for P0-4).

### E. Examination engine (integration, 21 checks) — ✅

Full lifecycle: start (answer rows) → resume → autosave (responses/flags/eliminations)
→ reload-restore → navigate → submit → exact per-type scores (9/12 on the fixture) →
review per feedback mode → mistakes/analytics updated. Plus: **stale autosave rejected
by revision guard** (REGRESSION), concurrent autosaves resolve to the highest rev,
duplicate + concurrent submission idempotent (one GradeEntry), attemptsAllowed enforced
(and race-free), autosave-after-submit 409, score-smuggling via PATCH ignored,
time-limit expiry (autosave refused, last saved state graded, time capped),
AFTER_CLOSE withheld until actual closure, NEVER never exposes keys, drafts invisible
to students, student cannot DELETE assessments, course-tied attempts require
enrollment, invalid question ids ignored, undefined-points regression (null item
points → question points → finite totals).

### F. Mistake log (integration, 10 checks) — ✅

All four categories classified correctly (INDEPENDENTLY_INCORRECT / AI_ASSISTED /
CORRECT_UNCERTAIN / CORRECT_SLOW), no entry for fast confident answers, dedup on
repeat misses, MASTERED re-opens a fresh entry, attempt history preserved, errorType
whitelist enforced, key-release policy (unanswered → withheld; pending-exam question →
withheld + correctness masked; released only after submitting an attempt containing it;
DRAFT/IN_REVIEW → 404).

### G. AI tutor (integration, 5 checks) — ✅ / ⛔

| Requirement | Status |
|---|---|
| Auth required (401) | ✅ |
| Org kill switch honored (403) | ✅ |
| EXPLAIN blocked for pending-assessment questions; HINT allowed | ✅ |
| Empty message rejected (400) | ✅ |
| Rate limiting (30/5 min) | ✅ (code path; exercised via lockout tests of the same limiter) |
| Live AI reply quality | ⛔ Not in the automated suite — requires the paid provider. Deterministic **mocks are not used**; instead the permission/guard/kill-switch paths are tested against the real route with the provider call unreachable, which exercises the documented offline fallback. Live-reply verification remains interactive-only. |
| Missing API key behavior | ⬜ The fallback branch is code-reviewed; not separately testable in this environment |

### H. Security regressions (integration, 12 checks) — ✅

Cross-origin POST/PATCH rejected (403); origin-less requests pass; security headers
present; cookie flags (HttpOnly, SameSite=Lax, Secure in production); role gates;
self-suspend blocked; org creation SUPER_ADMIN-only; JSON responses never contain
NaN/Infinity.

### I. Browser E2E (10 checks) — ✅

Login/logout/invalid login; full keyboard operability of the login form with visible
focus ring; course→lesson completion surviving reload; hash+session survival on
reload; full exam lifecycle in a real browser (answer → autosave indicator → reload →
answers restored → submit via dialog → results); a11y prefs persist across reload and
logout/login; RTL switch with `dir`/`lang` + Arabic chrome, persisting across reload;
reflow at 640px (200%) and 320px (400%) without horizontal scrolling.

### J. Accessibility automation (25 axe scans) — ✅

See `docs/ACCESSIBILITY_AUDIT.md`.

## 3. Known test-environment limitations (honest disclosure)

1. **No live screen reader** (NVDA/VoiceOver) in the sandbox — manual SR verification is
   **not claimed**. A11y evidence is: axe-core 4.14 automated scans (WCAG 2.x A/AA tags),
   keyboard operability tests, RTL tests and structural markup review.
2. **Session-expiration testing** uses the suspend-revocation path instead of waiting 14
   days (same deletion code path); clock manipulation is not available.
3. **AI tutor live replies** are not part of the automated suite (cost + non-determinism);
   permission/guard/fallback paths are covered.
4. Concurrency tests use parallel HTTP requests against the production server; they
   demonstrate the SQLite-level serialization guarantees of this deployment mode, not a
   multi-node deployment (documented architecture is single-instance).
