# Meridian Learning — Architecture

An original, accessibility-first LMS & exam-preparation platform. Clean-room implementation:
no code, assets, layouts, or protected content from Moodle or OnePrep. Reference products were
used only as publicly documented functional benchmarks.

## Stack (and why)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict | One codebase for UI + API routes; enforced typing end-to-end |
| UI | Tailwind 4 + shadcn/ui primitives + custom design tokens | Accessible primitives (Radix) under an original token system |
| DB | SQLite via Prisma (client-side file `db/custom.db`) | Zero-config dev; schema is ported-ready for PostgreSQL (types are portable; no SQLite-specific column types are used beyond JSON-as-text) |
| State | Zustand (persisted prefs) + per-view fetch | Simple, no over-fetching; preferences survive reloads |
| Charts | Recharts | Screen-reader-labelled custom wrappers; every chart has a text/table alternative |
| AI | z-ai-web-dev-sdk, server-side only | Provider-agnostic chat completion behind one route; org-level kill switch |

## Module map

```
src/lib/           domain services (no React)
  auth.ts          scrypt password hashing, cookie sessions
  api.ts           capability-based RBAC, tenant guards, audit helper
  scoring.ts       per-type answer validation + scoring (server-side only)
  mastery.ts       Beta-posterior skill mastery with 90% intervals
  srs.ts           Leitner spaced repetition (vocab + mistake retries)
  mistakes.ts      outcome → skill stats + mistake log policy
  planner.ts       explainable study-plan generator
  i18n.ts          EN/AR dictionaries, RTL awareness
  types.ts         shared domain types + response accessors

src/app/api/       30+ route handlers (see API surface below)
src/components/lms/
  AppRoot.tsx      session bootstrap, hash router, a11y side effects
  AppShell.tsx     role-based navigation, notifications, language, a11y panel
  QuestionRenderer.tsx  renders all 9 question types in exam/practice/review modes
  AccessibilityPanel.tsx  every preference, applied live
  views/*          20 role-aware views
prisma/seed.ts     original demo dataset (63 questions, 2 orgs, 10 users)
```

## API surface (selected)

- `auth/{register,login,logout,me}` — sessions in httpOnly cookies; `me` PATCH persists locale + a11y prefs
- `courses`, `courses/[id]`, `courses/[id]/{enroll,sections}`, `sections/[id]/lessons`, `lessons/[id]/{,complete}`
- `questions`, `questions/[id]`, `questions/import` (JSON + fingerprint dedup; imports always land IN_REVIEW)
- `assessments`, `assessments/[id]`, `assessments/[id]/attempts`
- `attempts/[id]` (GET state w/o keys · PATCH autosave), `attempts/[id]/submit` (server-side grading only)
- `practice/set` (filters/adaptive/mistake-retry), `practice/answer` (grades, logs mastery + mistakes, then releases key)
- `mistakes`, `mistakes/[id]`; `study-plan`, `study-tasks/[id]`; `vocab` (Leitner)
- `analytics/{student,teacher,admin}` — teacher includes p-value + point-biserial item analysis (n≥8 gate)
- `tutor` — mode-guarded AI chat (hint/Socratic/explain/plan); explain mode blocked during live attempts
- `admin/users`, `admin/orgs`, `audit`, `notifications`, `announcements`, `calendar`, `search`, `gradebook`

## Security model

- Every route re-authenticates via session cookie; capabilities checked server-side (`requireCapability`)
- Answer keys never reach the browser before submission/answer — grading happens server-side from stored responses
- Tenant isolation: org-scoped `where` clauses on every query; cross-org access returns 404
- Mistake/essay self-assessment cannot inflate grades (gradebook entries are written server-side)
- Audit log records auth events, content changes, grading, and admin actions

## Data model highlights

- Taxonomy: flexible tree (PROGRAM→SUBJECT→DOMAIN→SKILL→SUBSKILL) — no exam-specific fields on Question
- Question: `content` (rendering JSON) and `answerKey` (JSON) are separate; revisions snapshotted on every edit
- Attempt → Answer rows created up-front (stable navigator order), autosaved via upsert
- SkillStat / PracticeEvent / MistakeEntry / VocabProgress feed mastery, analytics, and SRS
