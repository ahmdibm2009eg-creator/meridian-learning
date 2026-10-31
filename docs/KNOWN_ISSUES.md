# Known Issues & Honest Limitations

Updated: Phase 2 (2026-10-31). Nothing here is hidden behind a fake "complete" status.

## Functional gaps (carried from Phase 1 unless noted)

1. **Assignments UI is read-only for students.** The API now supports the full
   create/submit/grade/re-grade lifecycle (integration-tested), but the student
   submission form and teacher grading form are still not built.
2. **Mistake-log inline retry renders the raw stem** without full options/pairs media.
   "Retry my mistakes" in Practice remains the full loop.
3. **Discussion posts** exist in the data model + seed but have no UI view.
4. **No password reset, email verification, MFA, or SSO.** Login rate limiting,
   session revocation and secure cookies were added in Phase 2; account recovery was
   not.
5. **Parent role has no dedicated view.**
6. **No offline/PWA support.** Deployment modes: dev server, `next build` + Node
   runtime (standalone). SQLite file copy remains a valid backup/restore mechanism
   (verified: migration ran on a backed-up copy without data loss).
7. **File uploads not implemented** — no upload surface exists yet. When introduced
   they must go through type/size validation and virus scanning (see NEXT_STEPS).
8. **Bulk user import/export, report builder, badges/certificates: not started.**
9. **Adaptive practice is mastery-ranked ordering, not IRT** — estimates are labelled.

## Technical debt

- `shuffleQuestions`/`shuffleOptions` stored and editable, but per-attempt shuffling is
  still not applied (stable order chosen deliberately for autosave correctness).
- Standalone assessments appear in the "all results" gradebook view; the
  course-filtered view excludes them (intentional).
- Search is `contains`-based (no ranking/fuzzy).
- Reading ruler is pointer-only.
- Practice-set generation at 100k questions is 138 ms p50 — the slowest
  student-facing path (see PERFORMANCE_REPORT §2).

## Phase-2-specific limitations (tested, documented)

- **Rate limiting is in-memory** → single-instance deployments only (the documented
  mode). Redis backend needed before horizontal scaling.
- **No CSP header yet** (deliberate: strict CSP with Next.js needs its own rollout).
- Login lockout is per ip+email — distributed rotating-IP attackers are not fully
  mitigated.
- **No automated screen-reader verification** (NVDA/VoiceOver unavailable here). A11y
  evidence is axe-core + keyboard + RTL automation (see ACCESSIBILITY_AUDIT §5).
- **Session-expiration testing** piggybacks on the suspend-revocation code path
  rather than clock control.
- AI tutor live-reply quality is verified interactively only; the automated suite
  covers permissions, guards, kill switch and offline fallback.
- No Dependabot/audit automation yet (GitHub-native; to enable in repo settings).
- Concurrency guarantees (submit idempotency, attemptsAllowed) were tested against a
  single SQLite-backed server; a multi-node deployment would need row-level locks or
  a queue.

## Dev-only credentials

Demo accounts use `Demo1234!`, created exclusively by `prisma/seed.ts`, which is a
no-op on populated databases and is never part of the production build path. Test
fixtures use `Test1234!` in `db/test.db` only.
