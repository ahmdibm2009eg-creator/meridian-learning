# Progress Report — Meridian Learning

Last updated: build session 1. Everything below was browser-verified end-to-end unless marked otherwise.

## Implemented and verified

### Foundation
- Original design system: warm-paper/teal/amber tokens, light/dark/high-contrast themes, 18px base, 44px targets
- Session auth (scrypt + httpOnly cookies), 6-role capability model, tenant isolation on every query
- EN/AR internationalisation with full RTL; 300+ dictionary strings
- Accessibility preferences panel (15+ controls) persisted per account, applied live to `<html>`
- Hash-based SPA routing (single `/` route), command palette (Ctrl+K) with universal search

### Courses
- Catalog → enrol → course detail (sections/lessons, roster, announcements, assignments, assessments tabs)
- Lesson reader: markdown + math spans, objectives, TTS read-aloud, prev/next, completion → progress + gradebook + notification
- Teacher authoring: course/section/lesson creation dialogs, announcement posting

### Question bank (63 seeded original questions)
- 9 types with per-type editors, live validation, difficulty/time/points, taxonomy tree mapping
- Structured solution strategies (5 slots) + misconceptions
- Review workflow DRAFT→IN_REVIEW→APPROVED with version snapshots on every edit
- JSON import with content-fingerprint dedup; imports quarantined to IN_REVIEW
- Passage entities with dual-pane rendering

### Assessment engine
- Builder: manual picker + balanced blueprint generator (difficulty mix), full settings, publish
- Exam interface: server-derived timer, navigator grid with state, flag, option elimination, calculator (safe-eval), formula sheet, scratchpad, debounced autosave (answers/flags/eliminations), resume, review-before-submit dialog
- Server-side-only scoring incl. partial credit; mistake logging + skill-stat updates on submit
- Results screen with per-question review (keys released only after submit per feedback mode)

### Exam preparation
- Practice: filters (type/difficulty/skill), adaptive weakest-first ordering, mistake-retry mode, instant feedback with explanations/strategies/misconceptions, essay self-assessment, AI-help flagging
- Mistake log: 6 categories, error taxonomy, root-cause notes, Leitner retries (1/3/7/16/35 days), mastered state, inline retry
- Study planner: generator (exam date/target/hours) → daily tasks with human-readable reasons, weekly mocks, replan-preserves-history
- Vocabulary: EN/AR cards, CEFR, TTS pronunciation, Leitner boxes
- AI tutor: 4 modes via z-ai SDK (Socratic verified live), exam-safe mode guards, org kill switch, disclaimer

### Analytics
- Student: accuracy trend chart, mastery bars with 90% intervals, readiness, streak, hours, due counts, explainable next-action
- Teacher: class stats, roster progress, at-risk flags, item analysis (p-value, point-biserial with n≥8 gate)
- Admin: users by role, active 7d, enrolments chart, question-type mix, org list, audit trail

### Demo dataset
2 orgs, 10 users (dev-only password `Demo1234!`), 3 courses, 63 questions, 5 assessments,
21 days of practice history, submitted attempts, 44 mistake entries, 24 vocab cards, study plan,
announcements, calendar events, notifications, audit entries.

## What was tested (and how)

- Browser E2E (agent-browser, accessibility-tree assertions): login/logout (all roles), dashboard,
  course→lesson→complete, practice answer/grade/feedback, full exam (start→autosave→flag→eliminate→
  navigator→submit→results→review→mistake log), question create/fix/approve (versioning),
  assessment blueprint/publish, a11y prefs (dark+ dyslexia persisted server-side), RTL switch,
  command palette, vocabulary review, study-task completion, AI tutor live reply
- API-level: autosave payload persistence, grading correctness, mistake creation from exams,
  analytics aggregation, item analysis values, audit trail, tenant isolation (org scoping in every query)
- `eslint .` clean; `tsc --noEmit` clean (app code)
- dev.log: zero 500s / zero unhandled runtime errors after fixes

## How to run

```bash
bun install
bun run db:push        # create SQLite schema
bun prisma/seed.ts     # demo data (dev-only credentials)
bun run dev            # http://localhost:3000
```

Demo accounts (development only — never ship): `student@northfield.edu`, `alex@northfield.edu`,
`teacher@northfield.edu`, `admin@northfield.edu`, `student@cedar.edu` (Arabic UI, isolated org).
Password for all: `Demo1234!`

## Next implementation priorities

1. Mistake-log retry from the log view (inline retry exists; full loop with rescheduling polish)
2. Gradebook export (CSV) + teacher manual grade overrides
3. Password reset + email verification; passkeys/WebAuthn
4. QTI/GIFT importers; PDF extraction pipeline with human review queue
5. Automated test suite (Vitest + Playwright + axe-core in CI)
6. PostgreSQL migration + object storage for file uploads
