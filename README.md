# Meridian Learning

An original, accessibility-first LMS & intelligent exam-preparation platform.
Clean-room implementation — no code or content from reference products.

**Stack:** Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · shadcn/ui ·
Prisma + SQLite (migration-ready) · Vitest · Playwright · axe-core

## Highlights

- **Courses & lessons** — catalog, enrollment, markdown lesson reader with objectives
  and TTS read-aloud, progress tracking, gradebook, calendar, announcements
- **Question bank** — 9 question types, review workflow (DRAFT → IN_REVIEW → APPROVED)
  with version snapshots, JSON import with fingerprint dedup, taxonomy tree
- **Assessment engine** — blueprint generator, exam UI (timer, navigator, flags, option
  elimination, calculator, scratchpad), debounced autosave with stale-write protection,
  resume after reload, **server-side scoring with partial credit**, item analysis
  (p-value, point-biserial)
- **Exam prep** — adaptive weakest-first practice, mistake log with Leitner SRS
  retries, explainable study planner, EN/AR vocabulary trainer
- **AI tutor** — mode-guarded (hint/Socratic/explain/plan), org kill switch,
  exam-integrity guards
- **Multi-tenant** — org isolation on every query, 6-role capability model
- **Accessibility-first** — EN/AR with full RTL, 15+ live accessibility preferences,
  WCAG 2.2 AA scans in CI
- **Analytics** — student mastery with credible intervals, teacher class/item analysis,
  admin dashboards, audit trail

## Quick start

```bash
bun install
cp .env.example .env
bun run db:push        # create the SQLite schema
bun run db:seed        # demo dataset (no-op if already seeded)
bun run dev            # http://localhost:3000
```

Demo accounts (development only): `student@northfield.edu`,
`teacher@northfield.edu`, `admin@northfield.edu`, `student@cedar.edu` (Arabic UI) —
password `Demo1234!`.

## Quality gates

```bash
bun run lint             # ESLint
bun run typecheck        # tsc --noEmit
bun run test             # 56 unit tests
bun run test:integration # 111 API tests (isolated DB + production server)
bun run test:e2e         # 35 browser tests incl. 25 axe-core accessibility scans
bun run test:all         # everything above
bun run bench            # performance benchmark at 1k / 10k / 100k questions
```

CI runs the full sequence on every push (`.github/workflows/ci.yml`).

## Documentation

- `docs/ARCHITECTURE.md` — module map and security model
- `docs/TECHNICAL_AUDIT.md` — Phase 2 baseline audit and fix log
- `docs/SECURITY_AUDIT.md` — OWASP-oriented posture and residual risks
- `docs/TEST_REPORT.md` — what is tested, how, and known test limitations
- `docs/ACCESSIBILITY_AUDIT.md` — WCAG 2.2 AA evidence (EN + AR)
- `docs/PERFORMANCE_REPORT.md` — measured benchmarks to 100k questions
- `docs/KNOWN_ISSUES.md` / `docs/NEXT_STEPS.md` — honest gaps and the backlog
- `docs/PROGRESS.md` — phase history
