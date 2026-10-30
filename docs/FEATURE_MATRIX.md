# Feature Parity Matrix

Status legend: ✅ Implemented & browser-verified · 🟡 Partial (see Known Issues) · ⬜ Not started
Reference behaviour for Moodle column is from public Moodle 5.x documentation; OnePrep column from
its public marketing pages. No proprietary code or content used.

## 1. Users, roles, tenancy

| Capability | Moodle (documented) | OnePrep | Meridian | Status |
|---|---|---|---|---|
| Email/password auth, sessions | ✔ | ✔ | scrypt hashes, httpOnly cookie sessions, server re-auth on every route | ✅ |
| Self-registration | ✔ | ✔ | Student/teacher signup; org join by code or auto-workspace | ✅ |
| Role model | Site/course contexts, archetypes | Simple tiers | 6 roles + capability map scoped org→resource; custom granularity per route | ✅ |
| Multi-tenancy | Cohorts/shared hosts | n/a | Org-isolated data on every query; cross-org returns 404; org branding colour | ✅ |
| Suspension / reactivation | ✔ | n/a | Suspend kills sessions; re-activate | ✅ |
| Password reset / MFA / SSO | ✔ | email-based | ⬜ (known issue #4) | ⬜ |
| Bulk user import/export | CSV webservices | n/a | ⬜ | ⬜ |

## 2. Courses & lessons

| Capability | Moodle | OnePrep | Meridian | Status |
|---|---|---|---|---|
| Course create/edit, sections, lessons | ✔ | n/a | Wizard-lite: title/desc/format → section → lesson (markdown editor) | ✅ |
| Enrolment + progress | ✔ | n/a | Self-enrol; per-lesson completion; live progress bars; completion → gradebook + notification | ✅ |
| Lesson reader | Page module | lessons | Markdown reader, TTS read-aloud, objectives, estimated time, prev/next | ✅ |
| Course duplication/backup | ✔ | n/a | ⬜ (SQLite file backup works; UI not built) | ⬜ |
| Conditional access / prerequisites | ✔ | n/a | ⬜ | ⬜ |

## 3. Question bank

| Capability | Moodle QBE | OnePrep | Meridian | Status |
|---|---|---|---|---|
| Question types | ~20 core types | MCQ mostly | 9 auto-scorable types incl. matching, ordering, fill-blank, numeric-with-tolerance, essay w/ rubric + self-assessment | ✅ |
| Taxonomy | Categories | SAT domains/skills | Flexible tree (Program→Subskill) + tags, no exam-specific fields | ✅ |
| Authoring | Forms + plugins | staff-only | Tabbed editor with live validation (missing key/stem/options blocks save), difficulty, time, points | ✅ |
| Multi-strategy explanations | single explanation | video solutions | Structured fields: fastest/standard/beginner/alternative/shortcut + misconceptions | ✅ |
| Review workflow | ✔ | n/a | DRAFT→IN_REVIEW→APPROVED; imports always land IN_REVIEW; versioning with rollback snapshots | ✅ |
| Bulk import | GIFT/AON/XML | PDF/DOCX upload | JSON import with SHA-1 fingerprint dedup + flagged-for-review counts | ✅ |
| PDF/DOCX/QTI import | ✔ plugins | ✔ | ⬜ (documented standard formats; extraction pipeline not built) | ⬜ |
| Passage-based items | ✔ | ✔ | Passage entity + dual-pane exam/practice reader | ✅ |

## 4. Assessment engine

| Capability | Moodle Quiz | OnePrep | Meridian | Status |
|---|---|---|---|---|
| Builder | ✔ | blueprint | Manual picker + balanced blueprint generator (difficulty mix), per-item points | ✅ |
| Exam UX | ✔ | Bluebook-inspired (ours is original) | Timer (server-derived), navigator grid, flag, option elimination, scratchpad, calculator, formula sheet, autosave, resume, review-before-submit | ✅ |
| Scoring | ✔ | ✔ | Server-side only; partial credit (matching/fill-blank); pass thresholds; attempt limits | ✅ |
| Feedback release | ✔ modes | after submit | AFTER_SUBMIT / AFTER_CLOSE / NEVER; keys never sent pre-submit | ✅ |
| Item analysis | Quiz statistics | basic | p-value + point-biserial discrimination with n≥8 reliability gate | ✅ |
| Adaptive/IRT selection | ✔ plugin | adaptive drills | Mastery-ranked question ordering (weakest-first); multi-stage IRT ⬜ | 🟡 |
| Section timing / breaks | ✔ | ✔ | ⬜ | ⬜ |

## 5. Exam preparation (OnePrep benchmark)

| Capability | OnePrep | Meridian | Status |
|---|---|---|---|
| Diagnostic → profile | ✔ | ✔ Diagnostic seeds SkillStats + plan | ✅ |
| Skill-filtered practice | ✔ | ✔ type/skill/difficulty filters, adaptive ordering, unseen bias ⬜ | ✅ |
| Mistake log | basic error list | Every non-independent solve enters the log w/ 6 categories, error taxonomy, root-cause notes, Leitner retry schedule, mastered state | ✅ |
| Timed drills | ✔ | ✔ slow-answer detection (>1.8× target) → CORRECT_SLOW | ✅ |
| Score reports | ✔ | Readiness estimate (weighted mastery + 90% interval), trend charts | ✅ |
| Study planner | ✔ static | Generator with per-task reasons; replan keeps history | ✅ |
| Vocabulary | ✔ | 24-word EN/AR bank, CEFR, TTS pronunciation, Leitner boxes | ✅ |
| AI tutor | ✔ | 4 modes (hint/Socratic/explain/plan); exam-safe guards; org kill switch; disclaimer | ✅ |
| Mock exams | ✔ | ✔ 20-question full mock w/ passage pane | ✅ |
| College exploration / applications | ✔ | ⬜ (out of current scope) | ⬜ |

## 6. Analytics & administration

| Capability | Moodle | Meridian | Status |
|---|---|---|---|
| Student analytics | activity reports | accuracy trend, mastery bars w/ uncertainty, streak, readiness, hours | ✅ |
| Teacher analytics | ✔ reports | class stats, roster progress, at-risk flags, item analysis | ✅ |
| Admin analytics | ✔ site reports | users by role, active 7d, enrolments, question mix, org list | ✅ |
| Gradebook | ✔ full | Weighted totals, categories, comments, assessment+assignment+lesson entries, export ⬜ | 🟡 |
| Announcements + notifications | ✔ | ✔ with per-user notification feed | ✅ |
| Calendar | ✔ | Agenda-style accessible list (class/exam/deadline/office hours) | ✅ |
| Audit log | ✔ site logs | ✔ action/entity/detail trail | ✅ |
| Custom report builder | ✔ | ⬜ | ⬜ |

## 7. Accessibility & i18n (beyond both references)

| Capability | Meridian | Status |
|---|---|---|
| WCAG 2.2 AA design target | 18px base text, 44px targets, focus-visible outlines everywhere, semantic landmarks, skip link, aria-live regions | ✅ |
| Personal a11y preferences | 15+ controls: text scale 85–160%, line-height, letter-spacing, dyslexia/serif fonts, reading width, high-contrast (AAA), dark, reduced motion, simplified UI, focus mode, reading ruler, paragraph isolation, underline links, progress bar — persisted per account | ✅ |
| Screen-reader safety | Radio/checkbox semantics on options, labelled progressbars, table captions, status never colour-alone (icon+text), navigator cells with state labels | ✅ |
| Full keyboard operation | Tab/arrow flows, Ctrl+K palette, Esc dialogs | ✅ |
| EN/AR bilingual UI | Complete dictionary, live `dir=rtl`, Arabic typography, Arabic vocab meanings | ✅ |
| Automated axe scans | ⬜ wired into CI (manual a11y-tree verification done; see Known Issues #7) | ⬜ |

## 8. Platform

| Capability | Meridian | Status |
|---|---|---|
| Offline/PWA, desktop packaging | ⬜ — documented as future work (see Known Issues #6) | ⬜ |
| Hosted deployment | Single Next.js server + SQLite here; PostgreSQL migration path documented | 🟡 |
| Backup/restore | `bun prisma/seed.ts` reseeds; SQLite file copy = full backup | 🟡 |
