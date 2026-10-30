# Known Issues & Honest Limitations

Nothing here is hidden behind a fake "complete" status. These are the gaps as of this build.

## Functional gaps

1. **Assignments UI is read-only for students.** The API supports create/submit/grade (and the seed
   contains graded examples shown in course + gradebook views), but the student submission form and
   teacher grading form are not built. The "Assignments" tab displays items and due dates only.
2. **Mistake-log inline retry renders the raw stem without media/options context.** The retry card
   fetches the question via the practice-answer flow but the inline renderer does not yet load the
   full question `content` (options, pairs). Use "Retry my mistakes" in Practice for the full loop.
3. **Discussion posts exist in the data model + seed but have no UI view.**
4. **No password reset, email verification, MFA, or SSO.** Registration + login + sessions only.
5. **Parent role is defined and seeded but has no dedicated view** (sees the student dashboard shell).
6. **No offline/PWA or desktop packaging.** The deployment modes are: this hosted dev server, or
   `next build` + a Node runtime. SQLite file copy is a working backup/restore mechanism.
7. **No automated test suite yet.** Verification was done via interactive browser E2E (a11y-tree
   assertions), API-level checks, ESLint, and `tsc`. Playwright/axe automation is the top priority.
8. **File uploads (assignments, question media) are not implemented** — no object storage wired.
9. **Bulk user import/export, custom report builder, competencies/badges/certificates: not started.**
10. **Adaptive testing is mastery-ranked ordering, not IRT.** Scores labelled as estimates; no
    proprietary exam algorithms are reproduced or claimed.

## Technical debt

- `shuffleQuestions`/`shuffleOptions` settings are stored and editable but the exam renderer does
  not yet apply per-attempt shuffling (order is stable by design for autosave correctness).
- Standalone assessments (no course) appear in the "all results" gradebook view; the course-filtered
  view intentionally excludes them.
- The audit view for ORG_ADMIN currently returns all events rather than filtering to org-scoped
  rows only (SUPER_ADMIN intended). Tenant data itself is isolated; the log view is broader.
- Search is `contains`-based (no fuzzy/ranking).
- Reading ruler is pointer-only (see ACCESSIBILITY.md gaps).

## Dev-only credentials

All demo accounts use `Demo1234!`. These exist solely for exploring the seeded dataset and must be
removed before any production deployment (the seed script is documented as development tooling).
