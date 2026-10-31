import { describe, it, expect } from "vitest";
import { Api, loginAs, USERS, body } from "../helpers/api";
import { tdb } from "../helpers/db";

/**
 * Mistake log classification + the practice answer-key release policy.
 *
 * Uses freshly-created questions (never attached to assessments) so results
 * are independent of test-file ordering.
 */
async function createStandaloneQuestion(stem: string, opts: { type?: string; estimatedSeconds?: number } = {}) {
  const teacher = await loginAs(USERS.teacherA);
  const payload = {
    type: opts.type ?? "MCQ_SINGLE",
    stem,
    content: { options: [{ id: "x", text: "1" }, { id: "y", text: "2" }] },
    answerKey: { correct: ["x"] },
    explanation: "The answer is x.",
    difficulty: 3,
    estimatedSeconds: opts.estimatedSeconds ?? 30,
    points: 1,
  };
  const res = await body<{ question: { id: string } }>(await teacher.post("/api/questions", payload));
  // Approve it so it enters the practice pool:
  await teacher.patch(`/api/questions/${res.question.id}`, { reviewStatus: "APPROVED" });
  return res.question.id;
}

async function practice(api: Api, questionId: string, payload: Record<string, unknown>) {
  const res = await api.post("/api/practice/answer", { questionId, ...payload });
  return { status: res.status, data: await body<Record<string, unknown>>(res) };
}

describe("mistake log — outcome classification", () => {
  it("independently incorrect answers are logged once, never duplicated", async () => {
    const student = await loginAs(USERS.studentA);
    const q1 = await createStandaloneQuestion("Mistake: wrong answer once");
    const wrong = { type: "MCQ_SINGLE", selected: ["y"] } as const;

    const first = await practice(student, q1, { response: wrong, secondsSpent: 10 });
    expect(first.status).toBe(200);
    expect((first.data.mistake as { category: string }).category).toBe("INDEPENDENTLY_INCORRECT");

    // Repeat the same wrong answer — same entry, not a second one.
    await practice(student, q1, { response: wrong, secondsSpent: 10 });
    const entries = await tdb.mistakeEntry.findMany({ where: { studentId: "student-a", questionId: q1 } });
    expect(entries).toHaveLength(1);
  });

  it("correct-but-AI-assisted answers are logged as AI_ASSISTED", async () => {
    const student = await loginAs(USERS.studentA);
    const q = await createStandaloneQuestion("Mistake: AI assisted");
    const res = await practice(student, q, { response: { type: "MCQ_SINGLE", selected: ["x"] }, secondsSpent: 10, usedAiHelp: true });
    expect((res.data.mistake as { category: string }).category).toBe("AI_ASSISTED");
    const entry = await tdb.mistakeEntry.findFirst({ where: { studentId: "student-a", questionId: q } });
    expect(entry?.category).toBe("AI_ASSISTED");
  });

  it("essay answers with UNCERTAIN self-assessment are logged as CORRECT_UNCERTAIN", async () => {
    const student = await loginAs(USERS.studentA);
    const teacher = await loginAs(USERS.teacherA);
    const created = await body<{ question: { id: string } }>(
      await teacher.post("/api/questions", {
        type: "ESSAY", stem: "Mistake: uncertain essay", content: { rubric: [], modelAnswer: "" },
        answerKey: {}, points: 5, estimatedSeconds: 30,
      })
    );
    await teacher.patch(`/api/questions/${created.question.id}`, { reviewStatus: "APPROVED" });

    const res = await practice(student, created.question.id, {
      response: { type: "ESSAY", text: "my attempt" },
      selfAssessment: "UNCERTAIN",
      secondsSpent: 20,
    });
    expect((res.data.mistake as { category: string })?.category).toBe("CORRECT_UNCERTAIN");
  });

  it("correct but slow answers are logged as CORRECT_SLOW (1.8× target time)", async () => {
    const student = await loginAs(USERS.studentA);
    const q = await createStandaloneQuestion("Mistake: slow answer", { estimatedSeconds: 30 });
    const res = await practice(student, q, { response: { type: "MCQ_SINGLE", selected: ["x"] }, secondsSpent: 100 });
    expect((res.data.mistake as { category: string }).category).toBe("CORRECT_SLOW");
  });

  it("fast confident correct answers create no mistake entry", async () => {
    const student = await loginAs(USERS.studentA);
    const q = await createStandaloneQuestion("Mistake: none expected");
    await practice(student, q, { response: { type: "MCQ_SINGLE", selected: ["x"] }, secondsSpent: 5 });
    const entries = await tdb.mistakeEntry.findMany({ where: { studentId: "student-a", questionId: q } });
    expect(entries).toHaveLength(0);
  });

  it("mastered questions leave the active log; a later miss opens a fresh entry", async () => {
    const student = await loginAs(USERS.studentA);
    const q = await createStandaloneQuestion("Mistake: mastered then missed");
    await practice(student, q, { response: { type: "MCQ_SINGLE", selected: ["y"] }, secondsSpent: 5 });
    const entry = await tdb.mistakeEntry.findFirstOrThrow({ where: { studentId: "student-a", questionId: q } });

    const mastered = await student.patch(`/api/mistakes/${entry.id}`, { action: "mastered" });
    expect(mastered.status).toBe(200);
    expect((await tdb.mistakeEntry.findUnique({ where: { id: entry.id } }))?.status).toBe("MASTERED");

    await practice(student, q, { response: { type: "MCQ_SINGLE", selected: ["y"] }, secondsSpent: 5 });
    const entries = await tdb.mistakeEntry.findMany({ where: { studentId: "student-a", questionId: q } });
    expect(entries).toHaveLength(2); // the mastered one + the fresh one
  });

  it("attempt history (PracticeEvent) is preserved per answer", async () => {
    const events = await tdb.practiceEvent.count({ where: { studentId: "student-a" } });
    expect(events).toBeGreaterThanOrEqual(6);
  });

  it("error-type updates are whitelisted; invalid values ignored", async () => {
    const student = await loginAs(USERS.studentA);
    const entries = await tdb.mistakeEntry.findMany({ where: { studentId: "student-a", status: { not: "MASTERED" } } });
    const target = entries[0];
    const res = await student.patch(`/api/mistakes/${target.id}`, { errorType: "CONCEPTUAL", rootCause: "Misread the sign." });
    expect(res.status).toBe(200);
    expect((await tdb.mistakeEntry.findUnique({ where: { id: target.id } }))?.errorType).toBe("CONCEPTUAL");
    await student.patch(`/api/mistakes/${target.id}`, { errorType: "HACKED_VALUE" });
    expect((await tdb.mistakeEntry.findUnique({ where: { id: target.id } }))?.errorType).toBe("CONCEPTUAL");
  });
});

describe("practice answer — key release policy (exam integrity)", () => {
  it("REGRESSION (P0): unanswered requests never receive key material", async () => {
    const student = await loginAs(USERS.studentA);
    const q = await createStandaloneQuestion("Key: unanswered request");
    const res = await practice(student, q, { response: null });
    expect(res.status).toBe(200);
    expect(res.data.answerKey).toBeUndefined();
    expect(res.data.explanation).toBeUndefined();
    expect(res.data.keyWithheld).toBe("unanswered");
  });

  it("REGRESSION (P0): keys for questions in pending graded assessments are withheld pre-exam", async () => {
    // Fresh student (registers as STUDENT in org alpha-test):
    const reg = new Api();
    const email = `keytest-${Date.now()}@meridian.test`;
    await reg.post("/api/auth/register", { name: "Key Test", email, password: "Password123!", organizationCode: "alpha-test" });

    // q-a-mcq1 is part of the PUBLISHED QUIZ "asmt-quiz"; this student has
    // not taken it yet → answering correctly must NOT release the key.
    const answered = await practice(reg, "q-a-mcq1", { response: { type: "MCQ_SINGLE", selected: ["opt2"] }, secondsSpent: 10 });
    expect(answered.status).toBe(200);
    expect(answered.data.answerKey).toBeUndefined();
    expect(answered.data.explanation).toBeUndefined();
    expect(answered.data.keyWithheld).toBe("assessment");
    // Correctness itself is masked for protected questions:
    expect((answered.data.result as { correct: boolean | null }).correct).toBeNull();

    // DRAFT/IN_REVIEW questions are not served at all:
    expect((await practice(reg, "q-a-draft", { response: { type: "MCQ_SINGLE", selected: ["opt1"] } })).status).toBe(404);
    expect((await practice(reg, "q-a-review", { response: { type: "MCQ_SINGLE", selected: ["opt2"] } })).status).toBe(404);

    // Take and submit the exam containing the question…
    const start = await body<{ attemptId: string }>(await reg.post("/api/assessments/asmt-quiz/attempts"));
    await reg.patch(`/api/attempts/${start.attemptId}`, {
      answers: [{ questionId: "q-a-mcq1", response: { type: "MCQ_SINGLE", selected: ["opt2"] } }],
    });
    await reg.post(`/api/attempts/${start.attemptId}/submit`);

    // …now practicing that question legitimately releases the key:
    const after = await practice(reg, "q-a-mcq1", { response: { type: "MCQ_SINGLE", selected: ["opt2"] }, secondsSpent: 10 });
    expect(after.data.answerKey).toEqual({ correct: ["opt2"] });
    expect(after.data.explanation).toBe("2 + 3 = 5.");
  });

  it("practice on a question inside an IN-PROGRESS attempt is blocked (409)", async () => {
    const student = await loginAs(USERS.studentB);
    // asmt-quiz belongs to org A — use org B: no assessment there, so instead
    // verify the guard via an org-A student with an in-progress attempt.
    const a = await loginAs(USERS.studentA2);
    const start = await body<{ attemptId: string }>(await a.post("/api/assessments/asmt-course/attempts"));
    const res = await practice(a, "q-a-mcq1", { response: { type: "MCQ_SINGLE", selected: ["opt2"] } });
    expect(res.status).toBe(409);
    // Clean up: submit the in-progress attempt so later suites are unaffected.
    await a.post(`/api/attempts/${start.attemptId}/submit`);
  });

  it("keys are released for ordinary (non-assessment) practice questions after answering", async () => {
    const student = await loginAs(USERS.studentA);
    const q = await createStandaloneQuestion("Key: normal release");
    const res = await practice(student, q, { response: { type: "MCQ_SINGLE", selected: ["x"] }, secondsSpent: 5 });
    expect(res.data.answerKey).toEqual({ correct: ["x"] });
    expect(res.data.explanation).toBe("The answer is x.");
    expect((res.data.result as { correct: boolean }).correct).toBe(true);
  });
});
