import { describe, it, expect } from "vitest";
import { loginAs, USERS, body } from "../helpers/api";
import { tdb } from "../helpers/db";

/** Shared payload factory: one valid create-payload per question type. */
function questionPayload(type: string) {
  const base = { type, stem: `Test ${type} question`, explanation: "Explanation text", difficulty: 3, estimatedSeconds: 60, points: 2 };
  switch (type) {
    case "MCQ_SINGLE":
      return { ...base, content: { options: [{ id: "x", text: "1" }, { id: "y", text: "2" }] }, answerKey: { correct: ["x"] } };
    case "MCQ_MULTI":
      return { ...base, content: { options: [{ id: "x", text: "1" }, { id: "y", text: "2" }] }, answerKey: { correct: ["x", "y"] } };
    case "TRUE_FALSE":
      return { ...base, content: {}, answerKey: { correct: true } };
    case "SHORT_ANSWER":
      return { ...base, content: {}, answerKey: { accepted: ["alpha"] } };
    case "NUMERIC":
      return { ...base, content: { unit: "m" }, answerKey: { value: 9.8, tolerance: 0.1 } };
    case "ESSAY":
      return { ...base, content: { rubric: [{ criterion: "Clarity", points: 2 }], modelAnswer: "…" }, answerKey: {} };
    case "MATCHING":
      return { ...base, content: { pairs: [{ id: "p1", left: "L", right: "R" }] }, answerKey: {} };
    case "ORDERING":
      return { ...base, content: { items: [{ id: "s1", text: "A" }, { id: "s2", text: "B" }] }, answerKey: { correctOrder: ["s1", "s2"] } };
    case "FILL_BLANK":
      return { ...base, content: { blanks: [{ id: "b1" }] }, answerKey: { accepted: { b1: ["x"] } } };
    default:
      throw new Error("unknown type");
  }
}

const NINE_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "NUMERIC", "ESSAY", "MATCHING", "ORDERING", "FILL_BLANK"];

describe("question bank — creation for every type", () => {
  const created: Record<string, string> = {};

  it("a teacher can create each of the nine question types", async () => {
    const teacher = await loginAs(USERS.teacherA);
    for (const type of NINE_TYPES) {
      const res = await teacher.post("/api/questions", questionPayload(type));
      expect(res.status, `create ${type}`).toBe(200);
      const { question } = await body<{ question: { id: string } }>(res);
      created[type] = question.id;
      expect(question.id).toBeTruthy();
      const row = await tdb.question.findUnique({ where: { id: question.id } });
      expect(row?.type).toBe(type);
      expect(row?.organizationId).toBe("org-a");
      expect(row?.points).toBe(2);
    }
  });

  it("students (and other orgs) cannot create questions", async () => {
    const student = await loginAs(USERS.studentA);
    expect((await student.post("/api/questions", questionPayload("MCQ_SINGLE"))).status).toBe(403);
  });

  it("invalid payloads are rejected with 400", async () => {
    const teacher = await loginAs(USERS.teacherA);
    expect((await teacher.post("/api/questions", { ...questionPayload("MCQ_SINGLE"), type: "NOT_A_TYPE" })).status).toBe(400);
    expect((await teacher.post("/api/questions", { ...questionPayload("MCQ_SINGLE"), stem: "" })).status).toBe(400);
    expect((await teacher.post("/api/questions", { ...questionPayload("MCQ_SINGLE"), answerKey: {} })).status).toBe(400);
    expect((await teacher.post("/api/questions", { ...questionPayload("NUMERIC"), difficulty: 99 })).status).toBe(400);
    expect((await teacher.post("/api/questions", { ...questionPayload("NUMERIC"), points: 1000 })).status).toBe(400);
  });

  it("cross-org taxonomy/passage references are rejected", async () => {
    const teacher = await loginAs(USERS.teacherA);
    expect(
      (await teacher.post("/api/questions", { ...questionPayload("MCQ_SINGLE"), taxonomyNodeId: "tax-skill-b" })).status
    ).toBe(404);
    const passageB = await tdb.passage.findFirst({ where: { organizationId: "org-b" } });
    expect(
      (await teacher.post("/api/questions", { ...questionPayload("MCQ_SINGLE"), passageId: passageB?.id })).status
    ).toBe(404);
  });

  it("REGRESSION (P0): student question detail hides the key AND the explanation/strategies", async () => {
    const student = await loginAs(USERS.studentA);
    for (const type of NINE_TYPES) {
      const res = await student.get(`/api/questions/${created[type]}`);
      expect(res.status, `GET ${type} as student`).toBe(200);
      const { question } = await body<{ question: Record<string, unknown> }>(res);
      expect(question.answerKey, `${type} answerKey`).toBeUndefined();
      expect(question.explanation, `${type} explanation`).toBeUndefined();
      expect(question.strategies, `${type} strategies`).toBeUndefined();
      expect(question.misconceptions, `${type} misconceptions`).toBeUndefined();
      expect(question.revisions, `${type} revisions`).toEqual([]);
      expect(question.content).toBeDefined(); // rendering data stays available
    }
    // Staff still see everything:
    const teacher = await loginAs(USERS.teacherA);
    const staff = await body<{ question: Record<string, unknown> }>(await teacher.get(`/api/questions/${created.MCQ_SINGLE}`));
    expect(staff.question.answerKey).toEqual({ correct: ["x"] });
    expect(staff.question.explanation).toBe("Explanation text");
  });

  it("the question list endpoint is staff-only", async () => {
    const student = await loginAs(USERS.studentA);
    expect((await student.get("/api/questions")).status).toBe(403);
  });

  it("paginates the question bank (page/pageSize/total/hasMore)", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const p1 = await body<{ questions: { id: string }[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
      await teacher.get("/api/questions?page=1&pageSize=10")
    );
    expect(p1.questions).toHaveLength(10);
    expect(p1.total).toBeGreaterThanOrEqual(13);
    expect(p1.hasMore).toBe(true);
    const p2 = await body<{ questions: { id: string }[]; hasMore: boolean }>(
      await teacher.get("/api/questions?page=2&pageSize=10")
    );
    expect(p2.questions).toHaveLength(10);
    const ids1 = new Set(p1.questions.map((q) => q.id));
    expect(p2.questions.some((q) => ids1.has(q.id))).toBe(false);
    // pageSize is clamped to a maximum of 100:
    const big = await teacher.get("/api/questions?page=1&pageSize=5000");
    expect((await body<{ pageSize: number }>(big)).pageSize).toBe(100);
  });
});

describe("question bank — editing, versioning, review workflow", () => {
  it("editing snapshots the previous version and increments the question version", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const created = await body<{ question: { id: string } }>(await teacher.post("/api/questions", questionPayload("MCQ_SINGLE")));
    const id = created.question.id;

    const edit = await teacher.patch(`/api/questions/${id}`, { stem: "Updated stem", difficulty: 4 });
    expect(edit.status).toBe(200);
    const row = await tdb.question.findUnique({ where: { id } });
    expect(row?.version).toBe(2);
    expect(row?.stem).toBe("Updated stem");
    const revisions = await tdb.questionRevision.findMany({ where: { questionId: id } });
    expect(revisions).toHaveLength(1);
    expect(JSON.parse(revisions[0].snapshot).stem).toBe("Test MCQ_SINGLE question"); // pre-edit snapshot
  });

  it("PATCH validates enums, clamps and cross-org references", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const created = await body<{ question: { id: string } }>(await teacher.post("/api/questions", questionPayload("NUMERIC")));
    const id = created.question.id;

    expect((await teacher.patch(`/api/questions/${id}`, { difficulty: 99 })).status).toBe(400);
    expect((await teacher.patch(`/api/questions/${id}`, { reviewStatus: "PUBLISHED" })).status).toBe(400);
    expect((await teacher.patch(`/api/questions/${id}`, { taxonomyNodeId: "tax-skill-b" })).status).toBe(404);
    expect((await teacher.patch(`/api/questions/${id}`, { noSuchField: 1 })).status).toBe(400);
    // The failed edits must not have consumed a version:
    const row = await tdb.question.findUnique({ where: { id } });
    expect(row?.version).toBe(1);
  });

  it("review workflow DRAFT → IN_REVIEW → APPROVED with an invalid status rejected", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const created = await body<{ question: { id: string } }>(await teacher.post("/api/questions", questionPayload("TRUE_FALSE")));
    const id = created.question.id;
    expect((await teacher.patch(`/api/questions/${id}`, { reviewStatus: "IN_REVIEW" })).status).toBe(200);
    expect((await teacher.patch(`/api/questions/${id}`, { reviewStatus: "APPROVED" })).status).toBe(200);
    expect((await tdb.question.findUnique({ where: { id } }))?.reviewStatus).toBe("APPROVED");
    expect((await teacher.patch(`/api/questions/${id}`, { reviewStatus: "DONE" })).status).toBe(400);
  });

  it("deletion is blocked while a question is used by an assessment", async () => {
    const teacher = await loginAs(USERS.teacherA);
    expect((await teacher.del("/api/questions/q-a-mcq1")).status).toBe(409);
    // An unused one deletes fine:
    const created = await body<{ question: { id: string } }>(await teacher.post("/api/questions", questionPayload("TRUE_FALSE")));
    expect((await teacher.del(`/api/questions/${created.question.id}`)).status).toBe(200);
  });
});

describe("question bank — JSON import", () => {
  it("imports valid items into IN_REVIEW, skips duplicates and flags bad types atomically", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const res = await teacher.post("/api/questions/import", {
      source: "test-import",
      questions: [
        { type: "MCQ_SINGLE", stem: "Imported question one", content: { options: [{ id: "a", text: "1" }] }, answerKey: { correct: ["a"] } },
        { type: "MCQ_SINGLE", stem: "What is 2 + 3?", content: {}, answerKey: {} }, // duplicate of q-a-mcq1 (fingerprint)
        { type: "HOLOGRAPHIC", stem: "Bad type" }, // flagged
      ],
    });
    expect(res.status).toBe(200);
    const result = await body<{ imported: number; duplicates: number; flagged: number; total: number }>(res);
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.flagged).toBe(1);
    const imported = await tdb.question.findFirst({ where: { stem: "Imported question one" } });
    expect(imported?.reviewStatus).toBe("IN_REVIEW");
    expect(imported?.copyrightNote).toBe("test-import");
  });
});

describe("practice — question pool hygiene", () => {
  it("practice sets contain only APPROVED org questions with keys stripped", async () => {
    const student = await loginAs(USERS.studentA);
    const res = await student.post("/api/practice/set", { limit: 20 });
    expect(res.status).toBe(200);
    const set = await body<{ questions: { id: string; answerKey?: unknown; explanation?: string }[]; passages: unknown[] }>(res);
    expect(set.questions.length).toBeGreaterThan(0);
    expect(set.questions.some((q) => q.id === "q-a-draft")).toBe(false);
    expect(set.questions.some((q) => q.id === "q-a-review")).toBe(false);
    expect(set.questions.some((q) => q.id === "q-b-mcq1")).toBe(false);
    for (const q of set.questions) {
      expect(q.answerKey).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
  });
});
