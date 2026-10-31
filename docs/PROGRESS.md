# Progress Report — Meridian Learning

Last updated: Phase 2 (2026-10-31). Everything below was verified by the automated
suite unless marked otherwise; commands to reproduce are in `docs/TEST_REPORT.md`.

## Phase 1 recap (session 1)

Original design system, session auth, 6-role capability model, EN/AR RTL, question
bank (63 seeded questions, 9 types, review workflow, JSON import), assessment engine
with server-side scoring + autosave, practice/mistakes/SRS/study planner/vocabulary,
AI tutor, three-tier analytics, demo dataset. Browser-verified interactively; **no
automated tests existed** — that was the top Phase-1 gap.

## Phase 2 (this session): hardening, testing, audit & repair

### Testing foundation (new)

- **Vitest** unit suite (56 tests): scoring for all 9 types incl. partial credit and
  NaN/Infinity guarantees, historical undefined-points regression, SRS schedules,
  Beta-posterior mastery + Wilson intervals, runtime-defensive response accessors.
- **API integration suite** (111 tests) against an isolated, deterministically-seeded
  test database (`db/test.db`) through a production-mode `next start` server:
  auth/session/lockout, 16-check tenant isolation with direct ID probing, course
  workflow, question bank (9 types), full exam lifecycle incl. concurrency and timing,
  mistake classification + key-release policy, transport security.
- **Playwright browser suite** (10 tests): login/keyboard flows, course→lesson
  completion persistence, full exam lifecycle with mid-exam reload recovery, RTL and
  preference persistence, 200%/400% reflow.
- **axe-core 4.14 scans** (25 screens, EN + AR) wired into the same run.
- **CI workflow** (`.github/workflows/ci.yml`): lint → typecheck → unit →
  integration → e2e/a11y → production build, failing on any red.
- **Benchmark harness** (`bun run bench`) with 1k/10k/100k synthetic questions.

### Security fixes (each with regression tests)

P0: practice answer-key harvesting; six cross-tenant write routes; global audit log;
question-detail explanation/strategy leak. P1: duplicate/concurrent submission,
re-grade stacking, completion race, attemptsAllowed race, student assessment deletion,
TEACHER self-registration, unenforced time limits, cross-org announcement fanout,
scoring crash on malformed responses, non-idempotent seed. P2: zod validation
everywhere it was missing, cross-org FK validation, org-scoped admin/org + audit
views, AFTER_CLOSE semantics, secure cookies, same-origin proxy + security headers,
login/tutor rate limits, session GC. See `docs/SECURITY_AUDIT.md` and
`docs/TECHNICAL_AUDIT.md`.

### Accessibility fixes (axe-verified)

Invalid `<dl>` markup, unnamed/mis-attributed ARIA sliders, Arabic label-content
mismatch, 400%-zoom reflow (header wrap + shrinkable dashboard sections). 25/25 scans
now clean of blocking violations.

### Database & data integrity

- Migration history introduced properly: baseline `0_init` resolved against the
  existing database (verified backup), then additive migration
  `20261030234642_answer_client_rev_session_index` (`Answer.clientRev` for the stale-
  autosave guard, `Session.userId` index). Data preserved (counts verified pre/post).
- Multi-step mutations are now transactional: submit, attempt start, item replacement,
  assignment grading, lesson completion, question snapshot+update, imports.
- Seed made idempotent (no-op on populated databases; verified across triple reseed).
- Backup procedure: `cp db/custom.db db/backups/<timestamp>.db` (used before the
  migration; restore = copy back).

### Performance

Question-bank pagination (server + UI "Load more"), measured benchmarks to 100k
questions (list 171 ms p50, autosave 12 ms, attempt start 7 ms at that scale). See
`docs/PERFORMANCE_REPORT.md`.

## Verification summary (Phase 2 close)

| Check | Result |
|---|---|
| `bun run lint` | clean |
| `bun run typecheck` | clean |
| Unit tests | 56/56 |
| Integration tests | 111/111 |
| Browser E2E + axe | 35/35 |
| Production build | succeeds |
| Seed idempotency | verified (3× reseed, zero duplicates) |
| Migration on live dev DB | applied, data intact |

## How to run

```bash
bun install
cp .env.example .env
bun run db:push        # or: bun run db:deploy (migrations)
bun run db:seed        # demo data (no-op if already seeded)
bun run dev            # http://localhost:3000
```

Demo accounts (development only): `student@northfield.edu`, `teacher@northfield.edu`,
`admin@northfield.edu`, `student@cedar.edu` (Arabic UI) — password `Demo1234!`.
