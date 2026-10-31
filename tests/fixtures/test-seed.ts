/**
 * Deterministic integration-test fixtures.
 *
 * Run (with DATABASE_URL pointing at the TEST database):
 *   bun tests/fixtures/test-seed.ts
 *
 * Everything uses fixed ids so tests can reference rows directly, and every
 * write is an upsert so re-seeding is idempotent. This dataset is completely
 * separate from the development demo seed (prisma/seed.ts).
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

const TEST_PASSWORD = "Test1234!";
function hash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

const MCQ_OPTIONS = (opts: [string, string][]) => JSON.stringify({ options: opts.map(([id, text]) => ({ id, text })) });

async function upsertUser(id: string, email: string, name: string, role: string, organizationId: string | null, suspended = false) {
  return db.user.upsert({
    where: { id },
    update: { role, organizationId, suspended },
    create: { id, email, name, role, organizationId, suspended, passwordHash: hash(TEST_PASSWORD) },
  });
}

async function main() {
  console.log("Seeding integration-test fixtures…");

  // ── Organizations ───────────────────────────────────────────
  await db.organization.upsert({ where: { id: "org-a" }, update: {}, create: { id: "org-a", name: "Alpha Test Academy", slug: "alpha-test" } });
  await db.organization.upsert({ where: { id: "org-b" }, update: {}, create: { id: "org-b", name: "Beta Test Institute", slug: "beta-test" } });

  // ── Users (all use TEST_PASSWORD) ───────────────────────────
  await upsertUser("super", "super@meridian.test", "Platform Admin", "SUPER_ADMIN", null);
  await upsertUser("admin-a", "admin-a@meridian.test", "Alpha Admin", "ORG_ADMIN", "org-a");
  await upsertUser("teacher-a", "teacher-a@meridian.test", "Alpha Teacher", "TEACHER", "org-a");
  await upsertUser("author-a", "author-a@meridian.test", "Alpha Author", "AUTHOR", "org-a");
  await upsertUser("student-a", "student-a@meridian.test", "Alice Student", "STUDENT", "org-a");
  await upsertUser("student-a2", "student-a2@meridian.test", "Arnold Student", "STUDENT", "org-a");
  await upsertUser("suspended-a", "suspended-a@meridian.test", "Suspended Student", "STUDENT", "org-a", true);
  await upsertUser("admin-b", "admin-b@meridian.test", "Beta Admin", "ORG_ADMIN", "org-b");
  await upsertUser("teacher-b", "teacher-b@meridian.test", "Beta Teacher", "TEACHER", "org-b");
  await upsertUser("student-b", "student-b@meridian.test", "Ben Student", "STUDENT", "org-b");

  // ── Taxonomy (org A full tree, org B single skill) ──────────
  const tax = [
    { id: "tax-program-a", organizationId: "org-a", parentId: null, name: "Mathematics", level: "PROGRAM", position: 0 },
    { id: "tax-subject-a", organizationId: "org-a", parentId: "tax-program-a", name: "Algebra", level: "SUBJECT", position: 0 },
    { id: "tax-domain-a", organizationId: "org-a", parentId: "tax-subject-a", name: "Equations", level: "DOMAIN", position: 0 },
    { id: "tax-skill-a", organizationId: "org-a", parentId: "tax-domain-a", name: "Linear Equations", level: "SKILL", position: 0 },
    { id: "tax-skill2-a", organizationId: "org-a", parentId: "tax-domain-a", name: "Quadratic Equations", level: "SKILL", position: 1 },
    { id: "tax-skill-b", organizationId: "org-b", parentId: null, name: "Beta Skill", level: "SKILL", position: 0 },
  ];
  for (const t of tax) {
    await db.taxonomyNode.upsert({ where: { id: t.id }, update: { name: t.name }, create: t });
  }

  // ── Passages ────────────────────────────────────────────────
  await db.passage.upsert({
    where: { id: "passage-a" },
    update: {},
    create: { id: "passage-a", organizationId: "org-a", title: "Reading: The Water Cycle", text: "Water moves through evaporation, condensation, and precipitation.", source: "Test fixture" },
  });
  await db.passage.upsert({
    where: { id: "passage-b" },
    update: {},
    create: { id: "passage-b", organizationId: "org-b", title: "Beta Reading", text: "A passage that belongs to org B.", source: "Test fixture" },
  });

  // ── Questions — one per type, org A ─────────────────────────
  type Q = {
    id: string; type: string; stem: string; content: string; answerKey: string;
    explanation: string; strategies: string; misconceptions: string;
    difficulty: number; estimatedSeconds: number; points: number;
    taxonomyNodeId: string | null; passageId: string | null; reviewStatus: string; authorId: string | null;
  };
  const questions: Q[] = [
    {
      id: "q-a-mcq1", type: "MCQ_SINGLE", stem: "What is 2 + 3?",
      content: MCQ_OPTIONS([["opt1", "4"], ["opt2", "5"], ["opt3", "6"], ["opt4", "7"]]),
      answerKey: JSON.stringify({ correct: ["opt2"] }),
      explanation: "2 + 3 = 5.", strategies: JSON.stringify({ fastest: "Recall addition facts." }),
      misconceptions: JSON.stringify(["Counting on from 3 twice."]),
      difficulty: 1, estimatedSeconds: 30, points: 2, taxonomyNodeId: "tax-skill-a", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-mcq2", type: "MCQ_MULTI", stem: "Select all prime numbers.",
      content: MCQ_OPTIONS([["a", "7"], ["b", "9"], ["c", "11"], ["d", "15"]]),
      answerKey: JSON.stringify({ correct: ["a", "c"] }),
      explanation: "7 and 11 are prime; 9 = 3×3 and 15 = 3×5.", strategies: "{}",
      misconceptions: "[]",
      difficulty: 2, estimatedSeconds: 60, points: 3, taxonomyNodeId: "tax-skill-a", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-tf", type: "TRUE_FALSE", stem: "The Sun is a star.",
      content: "{}", answerKey: JSON.stringify({ correct: true }),
      explanation: "The Sun is a G-type main-sequence star.", strategies: "{}", misconceptions: "[]",
      difficulty: 1, estimatedSeconds: 20, points: 1, taxonomyNodeId: null, passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-short", type: "SHORT_ANSWER", stem: "What is the process by which water moves through a semipermeable membrane?",
      content: "{}", answerKey: JSON.stringify({ accepted: ["Osmosis"] }),
      explanation: "Osmosis is the diffusion of water across a semipermeable membrane.", strategies: "{}", misconceptions: "[]",
      difficulty: 2, estimatedSeconds: 45, points: 1, taxonomyNodeId: null, passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-num", type: "NUMERIC", stem: "What is 6 × 7?",
      content: "{}", answerKey: JSON.stringify({ value: 42, tolerance: 0.5 }),
      explanation: "6 × 7 = 42.", strategies: "{}", misconceptions: "[]",
      difficulty: 1, estimatedSeconds: 20, points: 1, taxonomyNodeId: "tax-skill-a", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-essay", type: "ESSAY", stem: "Explain how a linear equation models a real-world situation.",
      content: JSON.stringify({ rubric: [{ criterion: "Correct model", points: 3 }, { criterion: "Clarity", points: 2 }], modelAnswer: "A linear equation y = mx + b models constant rate of change…" }),
      answerKey: "{}",
      explanation: "Strong answers identify slope as rate of change and intercept as starting value.", strategies: "{}", misconceptions: "[]",
      difficulty: 3, estimatedSeconds: 300, points: 5, taxonomyNodeId: "tax-skill-a", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-match", type: "MATCHING", stem: "Match each formula to what it computes.",
      content: JSON.stringify({ pairs: [
        { id: "p1", left: "y = mx + b", right: "Slope-intercept line" },
        { id: "p2", left: "x = (-b ± √D)/2a", right: "Quadratic formula" },
        { id: "p3", left: "a² + b² = c²", right: "Pythagorean theorem" },
      ] }),
      answerKey: "{}",
      explanation: "Each formula is uniquely associated with one concept.", strategies: "{}", misconceptions: "[]",
      difficulty: 2, estimatedSeconds: 90, points: 3, taxonomyNodeId: "tax-skill2-a", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-order", type: "ORDERING", stem: "Order the steps to solve a linear equation.",
      content: JSON.stringify({ items: [
        { id: "s1", text: "Distribute" }, { id: "s2", text: "Combine like terms" },
        { id: "s3", text: "Isolate the variable" }, { id: "s4", text: "Check the solution" },
      ] }),
      answerKey: JSON.stringify({ correctOrder: ["s1", "s2", "s3", "s4"] }),
      explanation: "Standard solving order.", strategies: "{}", misconceptions: "[]",
      difficulty: 2, estimatedSeconds: 60, points: 2, taxonomyNodeId: "tax-skill-a", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-fill", type: "FILL_BLANK", stem: "Water enters cells by {{1}}, and the cell's power plant is the {{2}}.",
      content: JSON.stringify({ blanks: [{ id: "b1", size: 20 }, { id: "b2", size: 20 }] }),
      answerKey: JSON.stringify({ accepted: { b1: ["osmosis"], b2: ["mitochondria"] } }),
      explanation: "Osmosis moves water; mitochondria produce ATP.", strategies: "{}", misconceptions: "[]",
      difficulty: 2, estimatedSeconds: 60, points: 2, taxonomyNodeId: null, passageId: null, reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-passage", type: "MCQ_SINGLE", stem: "According to the passage, which process forms clouds?",
      content: MCQ_OPTIONS([["opt1", "Evaporation"], ["opt2", "Condensation"], ["opt3", "Precipitation"]]),
      answerKey: JSON.stringify({ correct: ["opt2"] }),
      explanation: "Condensation forms clouds.", strategies: "{}", misconceptions: "[]",
      difficulty: 2, estimatedSeconds: 45, points: 1, taxonomyNodeId: null, passageId: "passage-a", reviewStatus: "APPROVED", authorId: "teacher-a",
    },
    {
      id: "q-a-draft", type: "MCQ_SINGLE", stem: "Draft question (not published).",
      content: MCQ_OPTIONS([["opt1", "A"], ["opt2", "B"]]),
      answerKey: JSON.stringify({ correct: ["opt1"] }),
      explanation: "Draft explanation that must never leak.", strategies: "{}", misconceptions: "[]",
      difficulty: 1, estimatedSeconds: 30, points: 1, taxonomyNodeId: null, passageId: null, reviewStatus: "DRAFT", authorId: "teacher-a",
    },
    {
      id: "q-a-review", type: "MCQ_SINGLE", stem: "In-review question (imported).",
      content: MCQ_OPTIONS([["opt1", "A"], ["opt2", "B"]]),
      answerKey: JSON.stringify({ correct: ["opt2"] }),
      explanation: "In-review explanation that must never leak.", strategies: "{}", misconceptions: "[]",
      difficulty: 1, estimatedSeconds: 30, points: 1, taxonomyNodeId: null, passageId: null, reviewStatus: "IN_REVIEW", authorId: "author-a",
    },
    {
      id: "q-b-mcq1", type: "MCQ_SINGLE", stem: "Beta-only question.",
      content: MCQ_OPTIONS([["opt1", "A"], ["opt2", "B"]]),
      answerKey: JSON.stringify({ correct: ["opt2"] }),
      explanation: "Beta explanation.", strategies: "{}", misconceptions: "[]",
      difficulty: 1, estimatedSeconds: 30, points: 1, taxonomyNodeId: "tax-skill-b", passageId: null, reviewStatus: "APPROVED", authorId: "teacher-b",
    },
  ];
  for (const q of questions) {
    await db.question.upsert({
      where: { id: q.id },
      update: { reviewStatus: q.reviewStatus, points: q.points },
      create: { ...q, organizationId: q.id.startsWith("q-b") ? "org-b" : "org-a", tags: "[]" },
    });
  }

  // ── Courses ─────────────────────────────────────────────────
  await db.course.upsert({
    where: { id: "course-a" },
    update: { status: "PUBLISHED" },
    create: { id: "course-a", organizationId: "org-a", title: "Algebra Foundations", description: "Linear and quadratic equations.", ownerId: "teacher-a", status: "PUBLISHED", estimatedHours: 12 },
  });
  await db.course.upsert({
    where: { id: "course-b" },
    update: {},
    create: { id: "course-b", organizationId: "org-b", title: "Beta Course", ownerId: "teacher-b", status: "PUBLISHED" },
  });
  const sections = [
    { id: "sec-a1", courseId: "course-a", title: "Basics", position: 0 },
    { id: "sec-a2", courseId: "course-a", title: "Applications", position: 1 },
  ];
  for (const s of sections) {
    await db.courseSection.upsert({ where: { id: s.id }, update: { title: s.title }, create: s });
  }
  const lessons = [
    { id: "les-a1", sectionId: "sec-a1", title: "What is a linear equation?", position: 0, content: "# Linear equations\nA **linear equation** has the form y = mx + b.", durationMin: 15 },
    { id: "les-a2", sectionId: "sec-a1", title: "Slope and intercept", position: 1, content: "# Slope\nThe slope m is the rate of change.", durationMin: 20 },
    { id: "les-a3", sectionId: "sec-a2", title: "Systems of equations", position: 0, content: "# Systems\nTwo equations, two unknowns.", durationMin: 25 },
    { id: "les-a4", sectionId: "sec-a2", title: "Word problems", position: 1, content: "# Word problems\nTranslate text into equations.", durationMin: 25 },
  ];
  for (const l of lessons) {
    await db.lesson.upsert({ where: { id: l.id }, update: { title: l.title }, create: { ...l, objectives: '["Translate word problems into equations"]', type: "READING" } });
  }

  // ── Enrollment ──────────────────────────────────────────────
  await db.enrollment.upsert({
    where: { courseId_studentId: { courseId: "course-a", studentId: "student-a" } },
    update: { status: "ACTIVE", completedAt: null },
    create: { courseId: "course-a", studentId: "student-a", status: "ACTIVE" },
  });

  // ── Assessments ─────────────────────────────────────────────
  const assessments = [
    { id: "asmt-quiz", organizationId: "org-a", courseId: null, title: "Algebra Quiz", type: "QUIZ", status: "PUBLISHED", timeLimitMin: null, attemptsAllowed: 2, feedbackMode: "AFTER_SUBMIT", passScorePct: 60, createdBy: "teacher-a" },
    { id: "asmt-close", organizationId: "org-a", courseId: null, title: "Feedback After Close Quiz", type: "QUIZ", status: "PUBLISHED", timeLimitMin: null, attemptsAllowed: 2, feedbackMode: "AFTER_CLOSE", passScorePct: 60, createdBy: "teacher-a" },
    { id: "asmt-timed", organizationId: "org-a", courseId: null, title: "Timed Exam", type: "EXAM", status: "PUBLISHED", timeLimitMin: 30, attemptsAllowed: 2, feedbackMode: "AFTER_SUBMIT", passScorePct: 50, createdBy: "teacher-a" },
    { id: "asmt-never", organizationId: "org-a", courseId: null, title: "No Feedback Quiz", type: "QUIZ", status: "PUBLISHED", timeLimitMin: null, attemptsAllowed: 2, feedbackMode: "NEVER", passScorePct: 60, createdBy: "teacher-a" },
    { id: "asmt-draft", organizationId: "org-a", courseId: null, title: "Draft Assessment", type: "QUIZ", status: "DRAFT", timeLimitMin: null, attemptsAllowed: 2, feedbackMode: "AFTER_SUBMIT", passScorePct: 60, createdBy: "teacher-a" },
    { id: "asmt-course", organizationId: "org-a", courseId: "course-a", title: "Course-Gated Quiz", type: "QUIZ", status: "PUBLISHED", timeLimitMin: null, attemptsAllowed: 2, feedbackMode: "AFTER_SUBMIT", passScorePct: 60, createdBy: "teacher-a" },
  ];
  for (const a of assessments) {
    await db.assessment.upsert({ where: { id: a.id }, update: { status: a.status }, create: a });
  }
  const items = [
    { id: "item-quiz-1", assessmentId: "asmt-quiz", questionId: "q-a-mcq1", position: 0, points: 2 },
    { id: "item-quiz-2", assessmentId: "asmt-quiz", questionId: "q-a-tf", position: 1, points: null },
    { id: "item-quiz-3", assessmentId: "asmt-quiz", questionId: "q-a-num", position: 2, points: null },
    { id: "item-quiz-4", assessmentId: "asmt-quiz", questionId: "q-a-short", position: 3, points: null },
    { id: "item-quiz-5", assessmentId: "asmt-quiz", questionId: "q-a-fill", position: 4, points: null },
    { id: "item-quiz-6", assessmentId: "asmt-quiz", questionId: "q-a-match", position: 5, points: null },
    { id: "item-quiz-7", assessmentId: "asmt-quiz", questionId: "q-a-order", position: 6, points: null },
    { id: "item-close-1", assessmentId: "asmt-close", questionId: "q-a-mcq2", position: 0, points: null },
    { id: "item-timed-1", assessmentId: "asmt-timed", questionId: "q-a-tf", position: 0, points: null },
    { id: "item-never-1", assessmentId: "asmt-never", questionId: "q-a-tf", position: 0, points: null },
    { id: "item-draft-1", assessmentId: "asmt-draft", questionId: "q-a-num", position: 0, points: null },
    { id: "item-course-1", assessmentId: "asmt-course", questionId: "q-a-mcq1", position: 0, points: null },
  ];
  for (const it of items) {
    await db.assessmentItem.upsert({ where: { id: it.id }, update: { points: it.points }, create: it });
  }

  // ── Vocabulary ──────────────────────────────────────────────
  await db.vocabItem.upsert({ where: { id: "vocab-a1" }, update: {}, create: { id: "vocab-a1", organizationId: "org-a", word: "ephemeral", definition: "Lasting a very short time.", cefr: "C1" } });
  await db.vocabItem.upsert({ where: { id: "vocab-a2" }, update: {}, create: { id: "vocab-a2", organizationId: "org-a", word: "candid", definition: "Truthful and straightforward.", cefr: "B2" } });
  await db.vocabItem.upsert({ where: { id: "vocab-b1" }, update: {}, create: { id: "vocab-b1", organizationId: "org-b", word: "beta-word", definition: "Beta org word.", cefr: "B1" } });

  // ── Calendar + announcements + audit rows for isolation tests ─
  await db.calendarEvent.upsert({
    where: { id: "cal-a1" },
    update: {},
    create: { id: "cal-a1", organizationId: "org-a", title: "Alpha midterm", startAt: new Date(Date.now() + 86400000 * 7), endAt: new Date(Date.now() + 86400000 * 7 + 5400000), type: "EXAM" },
  });
  await db.announcement.upsert({
    where: { id: "ann-a1" },
    update: {},
    create: { id: "ann-a1", organizationId: "org-a", authorId: "teacher-a", title: "Alpha announcement", body: "Welcome to Alpha." },
  });
  await db.auditLog.upsert({
    where: { id: "audit-a1" },
    update: {},
    create: { id: "audit-a1", userId: "admin-a", action: "test.alpha", entity: "test", entityId: "x", detail: "alpha-only event" },
  });
  await db.auditLog.upsert({
    where: { id: "audit-b1" },
    update: {},
    create: { id: "audit-b1", userId: "admin-b", action: "test.beta", entity: "test", entityId: "x", detail: "beta-only event" },
  });
  await db.auditLog.upsert({
    where: { id: "audit-sys" },
    update: {},
    create: { id: "audit-sys", userId: null, action: "test.system", entity: "test", entityId: "x", detail: "system event" },
  });

  // Clean slate for anything tests may have left behind on a re-seed.
  await db.attempt.deleteMany({ where: { OR: [{ studentId: "student-a" }, { studentId: "student-a2" }] } });
  await db.gradeEntry.deleteMany({ where: { studentId: { in: ["student-a", "student-a2"] } } });
  await db.mistakeEntry.deleteMany({ where: { studentId: { in: ["student-a", "student-a2", "student-b"] } } });
  await db.practiceEvent.deleteMany({ where: { studentId: { in: ["student-a", "student-a2", "student-b"] } } });
  await db.skillStat.deleteMany({ where: { studentId: { in: ["student-a", "student-a2", "student-b"] } } });
  await db.studyPlan.deleteMany({ where: { studentId: { in: ["student-a", "student-a2"] } } });
  await db.assignment.deleteMany({ where: { id: { startsWith: "asgn-test-" } } });
  await db.question.deleteMany({ where: { id: { startsWith: "q-test-" } } });
  await db.course.deleteMany({ where: { id: { startsWith: "course-test-" } } });
  await db.session.deleteMany({});

  console.log("Fixtures ready: 2 orgs, 10 users, 13 questions, 2 courses, 6 assessments.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
