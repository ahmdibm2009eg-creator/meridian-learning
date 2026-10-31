import { describe, it, expect } from "vitest";
import { loginAs, USERS, body, assertNoNaN } from "../helpers/api";
import { tdb } from "../helpers/db";

/** Start (or resume) an attempt and return its id. */
async function startAttempt(api: Awaited<ReturnType<typeof loginAs>>, assessmentId: string): Promise<string> {
  const res = await api.post(`/api/assessments/${assessmentId}/attempts`);
  expect(res.status, `start attempt on ${assessmentId}`).toBe(200);
  const data = await body<{ attemptId: string }>(res);
  return data.attemptId;
}

describe("exam engine — attempt lifecycle on asmt-quiz (7 items, 12 points)", () => {
  const ANSWERS = [
    { questionId: "q-a-mcq1", response: { type: "MCQ_SINGLE", selected: ["opt2"] } }, // ✓ 2
    { questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: true } }, // ✓ 1
    { questionId: "q-a-num", response: { type: "NUMERIC", value: 40 } }, // ✗ (42 ± 0.5) 0
    { questionId: "q-a-short", response: { type: "SHORT_ANSWER", text: "osmosis" } }, // ✓ 1
    { questionId: "q-a-fill", response: { type: "FILL_BLANK", values: { b1: "osmosis", b2: "wrong" } } }, // 1/2 → 1
    { questionId: "q-a-match", response: { type: "MATCHING", mapping: { p1: "Slope-intercept line", p2: "Quadratic formula", p3: "nope" } } }, // 2/3 → 2
    { questionId: "q-a-order", response: { type: "ORDERING", order: ["s1", "s2", "s3", "s4"] } }, // ✓ 2
  ];
  const EXPECTED_SCORE = 9;
  const EXPECTED_MAX = 12;

  it("starts an attempt with answer rows created up-front", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");
    const answers = await tdb.answer.findMany({ where: { attemptId } });
    expect(answers).toHaveLength(7);
    expect(answers.every((a) => a.response === "null")).toBe(true);
  });

  it("resume returns the same attempt instead of consuming a new one", async () => {
    const student = await loginAs(USERS.studentA);
    const first = await body<{ attemptId: string; resumed: boolean }>(await student.post("/api/assessments/asmt-quiz/attempts"));
    const second = await body<{ attemptId: string; resumed: boolean }>(await student.post("/api/assessments/asmt-quiz/attempts"));
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.resumed).toBe(true);
    const count = await tdb.attempt.count({ where: { assessmentId: "asmt-quiz", studentId: "student-a" } });
    expect(count).toBe(1);
  });

  it("autosaves responses, flags and eliminations; reload restores them", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");
    const save = await body<{ ok: boolean; saved: number }>(
      await student.patch(`/api/attempts/${attemptId}`, {
        answers: [
          ...ANSWERS,
          { questionId: "q-a-mcq1", flagged: true, eliminated: ["opt1", "opt3"] },
        ],
      })
    );
    expect(save.ok).toBe(true);
    expect(save.saved).toBeGreaterThanOrEqual(7);

    // Simulate a page reload: a fresh GET must return the saved state.
    const state = await body<{ attempt: { questions: { id: string; answer: { response: unknown; flagged: boolean; eliminated: string[] } }[] } }>(
      await student.get(`/api/attempts/${attemptId}`)
    );
    const byId = new Map(state.attempt.questions.map((q) => [q.id, q.answer]));
    expect(byId.get("q-a-mcq1")?.response).toEqual({ type: "MCQ_SINGLE", selected: ["opt2"] });
    expect(byId.get("q-a-mcq1")?.flagged).toBe(true);
    expect(byId.get("q-a-mcq1")?.eliminated).toEqual(["opt1", "opt3"]);
    expect(byId.get("q-a-order")?.response).toEqual({ type: "ORDERING", order: ["s1", "s2", "s3", "s4"] });
  });

  it("REGRESSION (stale autosave): older revisions never overwrite newer answers", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");

    // Save rev 5 with the correct answer…
    const newer = await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-num", rev: 5, response: { type: "NUMERIC", value: 42 } }],
    });
    expect((await body<{ saved: number }>(newer)).saved).toBe(1);

    // …then a stale save (rev 3, e.g. an in-flight debounce or second tab)
    // trying to write a WRONG answer must be rejected for that question.
    const stale = await body<{ saved: number; skippedStale: number }>(
      await student.patch(`/api/attempts/${attemptId}`, {
        answers: [{ questionId: "q-a-num", rev: 3, response: { type: "NUMERIC", value: 999 } }],
      })
    );
    expect(stale.saved).toBe(0);
    expect(stale.skippedStale).toBe(1);

    const ans = await tdb.answer.findFirst({ where: { attemptId, questionId: "q-a-num" } });
    expect(JSON.parse(ans!.response)).toEqual({ type: "NUMERIC", value: 42 });
    expect(ans!.clientRev).toBe(5);
  });

  it("REGRESSION (concurrent autosave): interleaved saves resolve to the highest revision", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");
    await Promise.all([
      student.patch(`/api/attempts/${attemptId}`, {
        answers: [{ questionId: "q-a-short", rev: 2, response: { type: "SHORT_ANSWER", text: "early answer" } }],
      }),
      student.patch(`/api/attempts/${attemptId}`, {
        answers: [{ questionId: "q-a-short", rev: 7, response: { type: "SHORT_ANSWER", text: "latest answer" } }],
      }),
    ]);
    const ans = await tdb.answer.findFirst({ where: { attemptId, questionId: "q-a-short" } });
    expect(JSON.parse(ans!.response).text).toBe("latest answer");
    expect(ans!.clientRev).toBe(7);
  });

  it("invalid question ids in autosave are ignored, not fatal", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");
    const res = await student.patch(`/api/attempts/${attemptId}`, {
      answers: [
        { questionId: "does-not-exist", response: { type: "TRUE_FALSE", selected: true } },
        { questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: true } },
      ],
    });
    expect(res.status).toBe(200);
    expect((await body<{ saved: number }>(res)).saved).toBe(1);
  });

  it("autosave cannot smuggle a score onto the attempt", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");
    const res = await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: true }, score: 100, isCorrect: true, pointsAwarded: 99 }],
    });
    expect(res.status).toBe(200);
    const attempt = await tdb.attempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.score).toBeNull();
    const ans = await tdb.answer.findFirst({ where: { attemptId, questionId: "q-a-tf" } });
    expect(ans?.isCorrect).toBeNull();
    expect(ans?.pointsAwarded).toBe(0);
  });

  it("submits with server-side scoring: exact per-type totals, finite values", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-quiz");
    await student.patch(`/api/attempts/${attemptId}`, { answers: ANSWERS });
    const res = await student.post(`/api/attempts/${attemptId}/submit`);
    expect(res.status).toBe(200);
    const result = await body<{
      ok: boolean; score: number; maxScore: number; pct: number; passed: boolean;
      correctCount: number; answeredCount: number; totalQuestions: number;
    }>(res);
    expect(result.score).toBe(EXPECTED_SCORE);
    expect(result.maxScore).toBe(EXPECTED_MAX);
    expect(result.pct).toBe(75);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(4);
    expect(result.answeredCount).toBe(7);
    expect(result.totalQuestions).toBe(7);
    expect(assertNoNaN(result)).toEqual([]);

    // Per-answer grading persisted:
    const answers = await tdb.answer.findMany({ where: { attemptId }, orderBy: { sequence: "asc" } });
    expect(answers[0].isCorrect).toBe(true);
    expect(answers[0].pointsAwarded).toBe(2);
    expect(answers[2].isCorrect).toBe(false); // NUMERIC wrong
    expect(answers[4].pointsAwarded).toBe(1); // FILL_BLANK partial
    expect(answers[5].pointsAwarded).toBe(2); // MATCHING partial
  });

  it("REGRESSION (undefined question-points): null item points fall back to question points", async () => {
    // item-quiz-2 (q-a-tf) has points NULL in the DB — the historical bug
    // turned that into `undefined` during scoring and NaN totals. The total
    // max of 12 above already proves the fallback; assert it directly:
    const item = await tdb.assessmentItem.findUnique({ where: { id: "item-quiz-2" } });
    expect(item?.points).toBeNull();
    const q = await tdb.question.findUnique({ where: { id: "q-a-tf" } });
    expect(q?.points).toBe(1);
    const attempt = await tdb.attempt.findFirst({ where: { assessmentId: "asmt-quiz", studentId: "student-a", status: "SUBMITTED" } });
    expect(attempt?.maxScore).toBe(12); // includes 1 point from the null-points item
    expect(Number.isFinite(attempt?.score ?? NaN)).toBe(true);
  });

  it("duplicate submission is idempotent (no duplicate gradebook/notification writes)", async () => {
    const student = await loginAs(USERS.studentA);
    const attempt = await tdb.attempt.findFirst({
      where: { assessmentId: "asmt-quiz", studentId: "student-a", status: "SUBMITTED" },
    });
    expect(attempt).toBeTruthy();
    const again = await body<{ ok: boolean; alreadySubmitted: boolean }>(
      await student.post(`/api/attempts/${attempt!.id}/submit`)
    );
    expect(again.alreadySubmitted).toBe(true);
    const gradeCount = await tdb.gradeEntry.count({ where: { assessmentId: "asmt-quiz", studentId: "student-a", itemType: "ASSESSMENT" } });
    expect(gradeCount).toBe(1);
  });

  it("REGRESSION (concurrent submission): two parallel submits produce exactly one gradebook entry", async () => {
    const student = await loginAs(USERS.studentA);
    // Second (final) allowed attempt:
    const attemptId = await startAttempt(student, "asmt-quiz");
    await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-mcq1", response: { type: "MCQ_SINGLE", selected: ["opt2"] } }],
    });
    const [a, b] = await Promise.all([
      student.post(`/api/attempts/${attemptId}/submit`),
      student.post(`/api/attempts/${attemptId}/submit`),
    ]);
    const results = await Promise.all([body<{ alreadySubmitted?: boolean; score?: number }>(a), body<{ alreadySubmitted?: boolean; score?: number }>(b)]);
    const submitted = results.filter((r) => !r.alreadySubmitted);
    expect(submitted).toHaveLength(1);
    const gradeCount = await tdb.gradeEntry.count({ where: { assessmentId: "asmt-quiz", studentId: "student-a", itemType: "ASSESSMENT" } });
    expect(gradeCount).toBe(1); // retake replaced, never duplicated
    const notifCount = await tdb.notification.count({ where: { userId: "student-a", title: { contains: "Algebra Quiz" } } });
    expect(notifCount).toBe(2); // exactly one per real submission (2 attempts)
  });

  it("attemptsAllowed is enforced once both attempts are used", async () => {
    const student = await loginAs(USERS.studentA);
    const res = await student.post("/api/assessments/asmt-quiz/attempts");
    expect(res.status).toBe(409);
  });

  it("autosave after submission is rejected (409)", async () => {
    const student = await loginAs(USERS.studentA);
    const attempt = await tdb.attempt.findFirst({
      where: { assessmentId: "asmt-quiz", studentId: "student-a", status: "SUBMITTED" },
      orderBy: { startedAt: "desc" },
    });
    const res = await student.patch(`/api/attempts/${attempt!.id}`, {
      answers: [{ questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: false } }],
    });
    expect(res.status).toBe(409);
  });

  it("review shows keys per feedback mode AFTER_SUBMIT; staff can review; other students cannot", async () => {
    const student = await loginAs(USERS.studentA);
    const attempt = await tdb.attempt.findFirst({
      where: { assessmentId: "asmt-quiz", studentId: "student-a", status: "SUBMITTED" },
    });
    const state = await body<{ attempt: { questions: { id: string; answerKey?: unknown; explanation?: string }[] } }>(
      await student.get(`/api/attempts/${attempt!.id}`)
    );
    const mcq = state.attempt.questions.find((q) => q.id === "q-a-mcq1")!;
    expect(mcq.answerKey).toEqual({ correct: ["opt2"] });
    expect(mcq.explanation).toBe("2 + 3 = 5.");

    const teacher = await loginAs(USERS.teacherA);
    expect((await teacher.get(`/api/attempts/${attempt!.id}`)).status).toBe(200);

    const other = await loginAs(USERS.studentA2);
    expect((await other.get(`/api/attempts/${attempt!.id}`)).status).toBe(403);
  });

  it("mistake log and analytics are updated by submission", async () => {
    const mistakes = await tdb.mistakeEntry.findMany({ where: { studentId: "student-a" } });
    expect(mistakes.length).toBeGreaterThanOrEqual(3); // num + fill + match were not fully correct
    const student = await loginAs(USERS.studentA);
    const analytics = await body<{ accuracy?: number; streak?: number; readiness?: number; totalAnswered?: number; answered?: number }>(
      await student.get("/api/analytics/student")
    );
    expect(JSON.stringify(analytics)).not.toContain("NaN");
    expect(JSON.stringify(analytics)).not.toContain("Infinity");
  });
});

describe("exam engine — feedback modes", () => {
  it("AFTER_CLOSE withholds keys until the assessment actually closes", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-close");
    await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-mcq2", response: { type: "MCQ_MULTI", selected: ["a", "c"] } }],
    });
    await student.post(`/api/attempts/${attemptId}/submit`);

    const before = await body<{ attempt: { questions: { id: string; answerKey?: unknown }[] } }>(
      await student.get(`/api/attempts/${attemptId}`)
    );
    expect(before.attempt.questions.find((q) => q.id === "q-a-mcq2")?.answerKey).toBeUndefined();

    // Teacher closes the assessment → keys become visible.
    const teacher = await loginAs(USERS.teacherA);
    expect((await teacher.patch("/api/assessments/asmt-close", { status: "CLOSED" })).status).toBe(200);
    const after = await body<{ attempt: { questions: { id: string; answerKey?: unknown }[] } }>(
      await student.get(`/api/attempts/${attemptId}`)
    );
    expect(after.attempt.questions.find((q) => q.id === "q-a-mcq2")?.answerKey).toEqual({ correct: ["a", "c"] });

    // restore for repeatability
    await teacher.patch("/api/assessments/asmt-close", { status: "PUBLISHED" });
  });

  it("NEVER feedback mode never exposes keys, even after submission", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-never");
    await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: true } }],
    });
    await student.post(`/api/attempts/${attemptId}/submit`);
    const state = await body<{ attempt: { questions: { id: string; answerKey?: unknown; explanation?: string }[] } }>(
      await student.get(`/api/attempts/${attemptId}`)
    );
    expect(state.attempt.questions[0].answerKey).toBeUndefined();
    expect(state.attempt.questions[0].explanation).toBeUndefined();
  });
});

describe("exam engine — server-side timing enforcement", () => {
  it("expired attempts reject autosave and auto-grade the last saved state", async () => {
    const student = await loginAs(USERS.studentA);
    const attemptId = await startAttempt(student, "asmt-timed");
    // Save a correct answer while the clock is still valid:
    await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: true } }],
    });

    // Time travel: the attempt started 31 minutes ago (limit is 30).
    await tdb.attempt.update({
      where: { id: attemptId },
      data: { startedAt: new Date(Date.now() - 31 * 60 * 1000) },
    });

    // Autosave past the deadline is refused…
    const late = await student.patch(`/api/attempts/${attemptId}`, {
      answers: [{ questionId: "q-a-tf", response: { type: "TRUE_FALSE", selected: false } }],
    });
    expect(late.status).toBe(409);

    // …and submission grades the last SAVED state (true, not the late false).
    const submit = await body<{ ok: boolean; score: number; expired: boolean; timeSpentSec: number }>(
      await student.post(`/api/attempts/${attemptId}/submit`)
    );
    expect(submit.ok).toBe(true);
    expect(submit.expired).toBe(true);
    expect(submit.score).toBe(1);
    expect(submit.timeSpentSec).toBeLessThanOrEqual(30 * 60 + 5);
  });
});

describe("exam engine — authorization and workflow guards", () => {
  it("students cannot delete assessments (authoring is staff-only)", async () => {
    const student = await loginAs(USERS.studentA);
    const res = await student.del("/api/assessments/asmt-quiz");
    expect(res.status).toBe(403);
  });

  it("draft assessments are invisible to students (detail and attempts)", async () => {
    const student = await loginAs(USERS.studentB);
    expect((await student.get("/api/assessments/asmt-draft")).status).toBe(404);
    expect((await student.post("/api/assessments/asmt-draft/attempts")).status).toBe(404); // cross-org
    const orgAStudent = await loginAs(USERS.studentA2);
    expect((await orgAStudent.get("/api/assessments/asmt-draft")).status).toBe(404);
    expect((await orgAStudent.post("/api/assessments/asmt-draft/attempts")).status).toBe(403); // not published
  });

  it("course-tied assessments require enrollment", async () => {
    const outsider = await loginAs(USERS.studentA2);
    expect((await outsider.post("/api/assessments/asmt-course/attempts")).status).toBe(403);
    // Enroll, then it works:
    expect((await outsider.post("/api/courses/course-a/enroll")).status).toBe(200);
    expect((await outsider.post("/api/assessments/asmt-course/attempts")).status).toBe(200);
  });

  it("assessment PATCH validates enums and cross-org question references", async () => {
    const teacher = await loginAs(USERS.teacherA);
    expect((await teacher.patch("/api/assessments/asmt-quiz", { type: "NOT_A_TYPE" })).status).toBe(400);
    expect((await teacher.patch("/api/assessments/asmt-quiz", { status: "SOMETHING" })).status).toBe(400);
    expect((await teacher.patch("/api/assessments/asmt-quiz", { courseId: "course-b" })).status).toBe(404);
    expect(
      (await teacher.patch("/api/assessments/asmt-quiz", { items: [{ questionId: "q-b-mcq1", points: 1 }] })).status
    ).toBe(404);
    // Cross-org item replacement must NOT have destroyed the existing items:
    const items = await tdb.assessmentItem.count({ where: { assessmentId: "asmt-quiz" } });
    expect(items).toBe(7);
  });
});
