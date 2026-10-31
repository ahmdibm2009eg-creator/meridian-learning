# Security Audit — Meridian Learning (Phase 2)

Method: structured review of all 44 API routes against OWASP Top-10 categories,
followed by fixes with regression tests. Baseline findings are in
`docs/TECHNICAL_AUDIT.md` §2; this document records the **security posture after
Phase 2** and how each control is enforced and tested.

## 1. Broken access control — FIXED & TESTED

- **Tenant isolation**: every org-scoped query filters by the session's
  `organizationId`; the six write routes that previously checked only role now also
  enforce organization equality (404 on mismatch — no existence leak). Verified with
  16 direct-ID cross-org probes in both directions (integration suite).
- **IDOR**: attempt/mistake/notification/study-task routes verify ownership; students
  reading another student's attempt get 403, wrong-org staff get 404.
- **Role gates**: capability matrix (`src/lib/api.ts`) enforced server-side; assessment
  DELETE now requires staff (P1-5 regression test); org creation is SUPER_ADMIN-only;
  registration is STUDENT-only (self-escalation regression test).
- **Enrollment gating** for course-tied assessments; drafts invisible to students.

## 2. Exam answer-key exposure — FIXED & TESTED (the highest-risk finding)

Threat model: keys must never reach the browser before the permitted review stage.

| Path | Control | Test |
|---|---|---|
| Practice (`/api/practice/answer`) | Keys released only when: question APPROVED **and** response actually answered **and** question is not in a pending graded assessment for this student (correctness masked too). After submitting an attempt containing the question, practice legitimately releases keys. | mistakes.test.ts (4 key-release tests incl. the pre-exam harvest regression) |
| Question detail (`/api/questions/[id]`) | Students receive neither key, nor explanation, strategies, misconceptions, nor revisions. | questions.test.ts (all 9 types) |
| Assessment detail | Students see items without `content`/`answerKey`; DRAFT assessments 404. | exams.test.ts |
| Attempt state (`/api/attempts/[id]`) | Keys only when submitted **and** feedback mode allows: AFTER_SUBMIT immediately; AFTER_CLOSE only after real closure; NEVER never. Staff reviewers may see keys. | exams.test.ts (3 mode tests) |
| Scoring | Always server-side from stored responses; a PATCH attempting to smuggle `score`/`isCorrect` is ignored (tested). | exams.test.ts |
| AI tutor | EXPLAIN mode blocked for questions inside an in-progress **or pending** graded assessment (pre-exam harvesting via the tutor). | security.test.ts |

## 3. Authentication & session security — HARDENED & TESTED

- scrypt (16-byte salt, `timingSafeEqual`) password verification — unchanged, solid.
- Opaque 256-bit DB-backed tokens; logout and admin-suspend delete the rows
  (revocation verified by test). Suspended users fail at session read too.
- Cookie: `httpOnly`, `SameSite=Lax`, `path=/`, 14-day absolute expiry, **`Secure` in
  production builds** (asserted in the integration suite against the prod-mode test server).
- Brute-force lockout: 10 failed logins per (ip, email) / 10 minutes → 429; success
  clears the bucket; per-email isolation verified.
- Expired sessions are opportunistically garbage-collected on read.

## 4. CSRF — MITIGATED (defense in depth)

- `SameSite=Lax` cookies block the classic cross-site form POST.
- `src/proxy.ts` additionally rejects POST/PUT/PATCH/DELETE with a foreign `Origin`
  (403) while allowing same-origin and origin-less (server-to-server) calls — verified
  by test. Requests without an Origin header are permitted by design (non-browser
  clients); session cookies still gate them.

## 5. Input validation & injection

- Zod schemas on all create/patch bodies that previously took loose input
  (questions, question edits, assessments, prefs, registration, login, imports);
  enum whitelists for statuses/types/roles/error types; numeric clamps.
- No raw SQL anywhere (100% Prisma query builder → parameterized). No `dangerouslySetInnerHTML`
  in the app; lesson content is markdown rendered through react-markdown (GFM) without raw HTML.
- Cross-org FK validation: taxonomy nodes, passages, questions, courses referenced in
  writes must belong to the caller's org.
- File uploads: not implemented (no upload surface exists) — nothing to audit; tracked
  in NEXT_STEPS with the requirement to add scanning when introduced.

## 6. Sensitive data & secrets

- No secrets in the repository: `.env` is gitignored; `.env.example` ships a relative
  dev path only. Demo credentials (`Demo1234!`) are confined to the dev-only seed,
  which is a documented no-op on populated databases and never runs in production
  (no seed in the CI/deploy path).
- Prisma query logging is opt-in (`PRISMA_QUERY_LOG=1`) and off in production.
- Security headers on all API responses: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (camera/mic/geolocation/payment disabled) — asserted by test.

## 7. Dependency posture

Runtime dependency set is unchanged from Phase 1 except dev-only additions
(vitest 3.2.7, @playwright/test 1.57.0, @axe-core/playwright 4.14.0 — all pinned in
`package.json` / `bun.lock`). An automated `npm audit`/Dependabot gate is listed in
NEXT_STEPS (requires GitHub-native tooling outside this sandbox).

## 8. Demo/production separation

- Test/bench/dev databases are separate files; tests never read `db/custom.db`.
- Dev-only demo accounts exist solely via `prisma/seed.ts`, which cannot run against a
  database it didn't build (idempotency guard) and is not part of `next build`.
- Production start (`NODE_ENV=production`) enables the `Secure` cookie flag; the
  origin-checking proxy runs in every mode.

## 9. Residual risks (accepted & documented)

1. Rate limiting is in-memory (single-instance deployments — the documented mode);
   swap for Redis before horizontal scaling.
2. No CSP header yet (Next.js + inline styles make a strict CSP a deliberate,
   separately-tested change — NEXT_STEPS).
3. Login lockout is per ip+email; a distributed attacker rotating IPs is not fully
   mitigated (would need org-level throttling / CAPTCHA).
4. No password reset/MFA yet (P1 feature gap, tracked).
