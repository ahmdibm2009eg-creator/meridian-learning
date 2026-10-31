# Technical Audit — Meridian Learning (Phase 2 baseline)

Date: 2026-10-31 · Scope: full repository inspection before any Phase 2 modification.
Method: every API route file, all `src/lib` domain modules, the Prisma schema, the
assessment engine, autosave, grading, analytics and the accessibility system were read
line-by-line (independently of the Phase 1 report's claims). Findings below were
**verified against the actual code** and, where feasible, re-verified with regression
tests after fixing.

## 1. What actually worked (verified)

| Area | Evidence |
|---|---|
| Session auth (scrypt + httpOnly cookies, DB-backed revocation) | `src/lib/auth.ts`; suspend deletes sessions (verified by integration test) |
| Server-side scoring for all 9 types incl. partial credit | `src/lib/scoring.ts`; 56 unit tests cover every type |
| Practice sets strip answer keys | `publicQuestion()`; verified in tests |
| Org scoping on the *read* paths of most list endpoints | courses/questions/assessments/mistakes/vocab/taxonomy/gradebook listings |
| Attempt autosave upsert semantics | PATCH upserts answers, resume returns the same attempt |
| Lesson→progress→gradebook flow | verified end-to-end (API + browser) |
| Mistake-log dedup per (student, question) | `lib/mistakes.ts` findFirst-or-create |
| EN/AR RTL, a11y preferences persisted server-side | browser E2E |

## 2. Defects found (baseline), by severity

### P0 — cross-tenant access / answer-key exposure

| # | Defect | Location (baseline) |
|---|---|---|
| P0-1 | **Answer-key harvest**: `POST /api/practice/answer` released `answerKey`, `explanation`, `strategies`, `misconceptions` unconditionally — even for `response: null` — for any org question. Combined with assessment GET exposing item question ids, a student could harvest every exam key *before* starting the attempt. | `api/practice/answer` |
| P0-2 | **Cross-tenant writes**: 6 routes checked `ORG_ADMIN` role without comparing `organizationId` — an org-B admin could patch org-A courses/lessons, create sections/lessons/assignments, and grade org-A submissions. | `courses/[id]` PATCH, `courses/[id]/sections`, `lessons/[id]` PATCH, `sections/[id]/lessons`, `assignments` POST, `assignments/[id]/grade` |
| P0-3 | **Cross-tenant audit read**: the org filter was `l.user?.name !== undefined` — org admins saw every organization's audit events. | `api/audit` |
| P0-4 | **Question detail leak**: only `answerKey` was masked for students; `explanation`, `strategies`, `misconceptions` (which reveal the answer) were returned to any same-org user. | `api/questions/[id]` GET |

### P1 — broken workflows / races / escalation

| # | Defect |
|---|---|
| P1-1 | Duplicate attempt submission (read-then-write, no transaction) → duplicated GradeEntry + double mistake-log counting |
| P1-2 | Re-grading an assignment inserted an *additional* GradeEntry each time (gradebook double-counting) |
| P1-3 | Lesson completion race → duplicate completion grade entries + notifications |
| P1-4 | `attemptsAllowed` bypass via concurrent attempt starts |
| P1-5 | **Students could delete assessments** (DELETE had no role gate) |
| P1-6 | Public registration accepted `role: "TEACHER"` (join-by-slug → instant staff account) |
| P1-7 | Assessment time limits never enforced server-side (autosave accepted indefinitely; late submits scored fully) |
| P1-8 | Announcements: cross-org `courseId` → notification fanout into another org |
| P1-9 | **Scoring engine crash vector**: `{"type":"MCQ_SINGLE","selected":null}` crashed `scoreAnswer` (`selected.length` of null) → 500 on submit, attempt wedged in IN_PROGRESS forever |
| P1-10 | **Seed duplication**: `prisma/seed.ts` used 51 unconditional `create()` calls — every reseed doubled courses (3→6→9), questions (64→127→190), attempts, history |
| P1-11 | `AFTER_CLOSE` feedback mode behaved as `AFTER_SUBMIT` (no closure check) |

### P2 — validation / integrity gaps

Cross-org FK references accepted (`taxonomyNodeId`, `passageId`, `items[].questionId`, `courseId`); no `$transaction` anywhere; submit crashed on missing Answer rows (`ans!.id`); unvalidated PATCH bodies (review status, assessment enums, difficulty/points unclamped); `/api/auth/me` prefs unvalidated + unsafe `JSON.parse`; ORG_ADMIN could list/create all organizations; teacher-analytics per-learner averages used an index-mismatched filter (wrong averages); assignment resubmission silently hid grades; `dueAt` never enforced; session cookie lacked `secure` in production; no CSRF/origin checking; no rate limiting anywhere.

### P3 — minor

`organizationId ?? "none"` magic strings broke SUPER_ADMIN listings; expired Session rows never purged; SUPER_ADMIN capability matrix omissions; vocab GET performs writes; no middleware; tutor exam guard bypassable pre-attempt.

## 3. Data-loss scenarios identified (baseline)

1. Assessment item replacement was non-transactional (`deleteMany` then `createMany`) — a mid-way failure destroyed the item list.
2. Submit was non-transactional across answer updates / grade entry / notification — partial failure left half-graded attempts.
3. Reseeding the dev database silently duplicated all content (P1-10).
4. No migration history at all (`prisma db push` workflow) — schema changes were unauditable.

All four are addressed in Phase 2 (transactions, claim-based submit, idempotent seed guard, baseline + additive migration).

## 4. Fix log (Phase 2)

Every P0/P1 above and the listed P2s were fixed; each security/data-integrity fix carries a regression test (see `docs/TEST_REPORT.md`). Highlights:

- `src/proxy.ts` (Next 16 proxy, ex-middleware): same-origin enforcement for mutating API requests + security headers.
- `src/lib/ratelimit.ts`: failed-login lockout (10/10 min per ip+email) and tutor rate limit (30/5 min per user).
- Cookie hardening (`secure` in production); expired-session GC.
- Six cross-tenant routes now enforce organization equality (404 on mismatch).
- `practice/answer` key-release policy: APPROVED-only, answered-only, and withheld for questions in pending graded assessments until the student has submitted an attempt containing them (correctness masked too).
- Attempt submission is a single transaction with an atomic status claim (idempotent under concurrency); gradebook entry per (assessment, student) replaces instead of stacking; missing answer rows skipped; totals normalized (never NaN/Infinity).
- Autosave: per-question monotonic `clientRev` guard (stale writes rejected), time-limit enforcement (+5 s grace) with auto-grading of last saved state.
- Registration is STUDENT-only (payload role accepted-but-ignored); register form role selector removed.
- Zod validation on questions/assessments/me PATCH bodies; cross-org FK checks on every write path; org-scoped audit log and org list.
- `Answer.clientRev` column + `Session.userId` index added via a real migration (`20261030234642_answer_client_rev_session_index`) on a verified backup.
- Seed idempotency guard (no-op reseed, never deletes data).
- Scoring accessors made runtime-defensive (malformed payloads degrade to "unanswered").

## 5. Honest verification statement

The Phase 1 report's claim that "tenant data itself is isolated" held for *read* listings
but **not** for the six write routes, the audit log, or the practice key-release path —
all verified exploitable at the HTTP level before fixing. The Phase 1 claim of correct
autosave held for the single-tab happy path only; the multi-tab/concurrency contract is
new in Phase 2 and regression-tested.
