# Next Steps — Meridian Learning

Prioritized backlog after Phase 2. P0/P1 defects found during the phase are resolved;
everything below is new capability or debt payoff, ordered by user impact.

## 1. Close the assignment loop in the UI (P1)

The API is complete and tested (create/submit/grade/re-grade/lock/late rules), but the
student submission form and the teacher grading form are not built. Build both against
the existing endpoints — no backend work required.

## 2. Account recovery & stronger auth (P1)

Password reset (token via email), email verification, then passkeys/WebAuthn. The
session layer (opaque DB tokens + revocation) already supports the flows.

## 3. Mistake-log inline retry, full renderer (P2)

Reuse `QuestionRenderer` in the retry card so options/pairs render like Practice.

## 4. Test-depth improvements (P2)

- Add a Lighthouse/performance budget CI job (page-load + mobile emulation).
- Enable Dependabot + `bun audit` in CI.
- Add a session-expiry test with a controllable clock (extract session TTL).
- soak test for memory (long-run bench).

## 5. Performance follow-ups (P2)

- Covering index `(organizationId, reviewStatus, taxonomyNodeId)` if practice-set
  generation regresses beyond ~250 ms.
- Cursor-based pagination for the question bank if skip-scan ever dominates.

## 6. Production platform work (P2)

- PostgreSQL migration (schema is portable; single-file SQLite is the 100k-question
  ceiling measured in PERFORMANCE_REPORT) + object storage for uploads.
- Redis-backed rate limiting before any horizontal scaling.
- Strict CSP rollout (needs nonce-based inline style policy with Next.js).
- File uploads with type/size validation + malware scanning when the feature lands.

## 7. Feature backlog (P3)

QTI/GIFT importers; PDF extraction pipeline with human review queue; bulk user
import/export; competencies/badges/certificates; discussion UI for the existing data
model; parent dashboard; per-attempt question/option shuffling (needs deterministic
per-attempt seeds to stay autosave-safe); PWA/offline lesson reading.
