import { describe, it, expect } from "vitest";
import { scoreAnswer, isAnswered, publicQuestion } from "@/lib/scoring";

// ── Fixture payloads for every question type ──────────────────
const MCQ1_CONTENT = JSON.stringify({
  options: [
    { id: "opt1", text: "4" },
    { id: "opt2", text: "5" },
    { id: "opt3", text: "6" },
    { id: "opt4", text: "7" },
  ],
});
const MCQ1_KEY = JSON.stringify({ correct: ["opt2"] });

const MCM_CONTENT = JSON.stringify({
  options: [
    { id: "a", text: "Paris" },
    { id: "b", text: "Lyon" },
    { id: "c", text: "Marseille" },
    { id: "d", text: "Nice" },
  ],
});
const MCM_KEY = JSON.stringify({ correct: ["a", "c"] });

const MATCH_CONTENT = JSON.stringify({
  pairs: [
    { id: "p1", left: "H2O", right: "Water" },
    { id: "p2", left: "NaCl", right: "Salt" },
    { id: "p3", left: "CO2", right: "Carbon dioxide" },
    { id: "p4", left: "O2", right: "Oxygen" },
  ],
});

const FILL_KEY = JSON.stringify({
  accepted: {
    b1: ["mitochondria", "Mitochondria"],
    b2: ["osmosis"],
  },
});

const ORDER_KEY = JSON.stringify({ correctOrder: ["s1", "s2", "s3", "s4"] });

describe("scoring — MCQ_SINGLE", () => {
  it("awards full points for the correct selection", () => {
    const r = scoreAnswer("MCQ_SINGLE", MCQ1_CONTENT, MCQ1_KEY, JSON.stringify({ type: "MCQ_SINGLE", selected: ["opt2"] }), 3);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(3);
    expect(r.max).toBe(3);
  });
  it("awards zero for a wrong selection", () => {
    const r = scoreAnswer("MCQ_SINGLE", MCQ1_CONTENT, MCQ1_KEY, JSON.stringify({ type: "MCQ_SINGLE", selected: ["opt1"] }), 3);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
  });
  it("treats a null response as unanswered/incorrect with finite values", () => {
    const r = scoreAnswer("MCQ_SINGLE", MCQ1_CONTENT, MCQ1_KEY, null, 3);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
    expect(Number.isFinite(r.awarded)).toBe(true);
  });
});

describe("scoring — MCQ_MULTI (exact set match)", () => {
  it("full points for the exact set", () => {
    const r = scoreAnswer("MCQ_MULTI", MCM_CONTENT, MCM_KEY, JSON.stringify({ type: "MCQ_MULTI", selected: ["c", "a"] }), 4);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(4);
  });
  it("zero for a subset (no partial credit on MCQ_MULTI)", () => {
    const r = scoreAnswer("MCQ_MULTI", MCM_CONTENT, MCM_KEY, JSON.stringify({ type: "MCQ_MULTI", selected: ["a"] }), 4);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
  });
  it("zero for a superset", () => {
    const r = scoreAnswer("MCQ_MULTI", MCM_CONTENT, MCM_KEY, JSON.stringify({ type: "MCQ_MULTI", selected: ["a", "c", "b"] }), 4);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
  });
});

describe("scoring — TRUE_FALSE", () => {
  it("correct side full points", () => {
    const key = JSON.stringify({ correct: true });
    const r = scoreAnswer("TRUE_FALSE", "{}", key, JSON.stringify({ type: "TRUE_FALSE", selected: true }), 1);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(1);
  });
  it("wrong side scores zero", () => {
    const key = JSON.stringify({ correct: false });
    const r = scoreAnswer("TRUE_FALSE", "{}", key, JSON.stringify({ type: "TRUE_FALSE", selected: true }), 1);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
  });
});

describe("scoring — SHORT_ANSWER (normalization)", () => {
  const key = JSON.stringify({ accepted: ["Osmosis"] });
  it("matches case-insensitively and trims", () => {
    const r = scoreAnswer("SHORT_ANSWER", "{}", key, JSON.stringify({ type: "SHORT_ANSWER", text: "  osmosis " }), 2);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(2);
  });
  it("matches after punctuation stripping", () => {
    const r = scoreAnswer("SHORT_ANSWER", "{}", key, JSON.stringify({ type: "SHORT_ANSWER", text: "Osmosis." }), 2);
    expect(r.correct).toBe(true);
  });
  it("rejects a different word", () => {
    const r = scoreAnswer("SHORT_ANSWER", "{}", key, JSON.stringify({ type: "SHORT_ANSWER", text: "diffusion" }), 2);
    expect(r.correct).toBe(false);
  });
});

describe("scoring — NUMERIC (tolerance)", () => {
  const key = JSON.stringify({ value: 42, tolerance: 0.5 });
  it("exact value is correct", () => {
    const r = scoreAnswer("NUMERIC", "{}", key, JSON.stringify({ type: "NUMERIC", value: 42 }), 1);
    expect(r.correct).toBe(true);
  });
  it("boundary of tolerance is correct", () => {
    const r = scoreAnswer("NUMERIC", "{}", key, JSON.stringify({ type: "NUMERIC", value: 42.5 }), 1);
    expect(r.correct).toBe(true);
  });
  it("just outside tolerance is wrong", () => {
    const r = scoreAnswer("NUMERIC", "{}", key, JSON.stringify({ type: "NUMERIC", value: 42.51 }), 1);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
  });
  it("null value is wrong but finite", () => {
    const r = scoreAnswer("NUMERIC", "{}", key, JSON.stringify({ type: "NUMERIC", value: null }), 1);
    expect(r.correct).toBe(false);
    expect(Number.isFinite(r.awarded)).toBe(true);
  });
  it("negative values work", () => {
    const key2 = JSON.stringify({ value: -3, tolerance: 0 });
    const r = scoreAnswer("NUMERIC", "{}", key2, JSON.stringify({ type: "NUMERIC", value: -3 }), 1);
    expect(r.correct).toBe(true);
  });
});

describe("scoring — ESSAY (not auto-scorable)", () => {
  it("returns null correctness and zero points", () => {
    const r = scoreAnswer("ESSAY", JSON.stringify({ rubric: [], modelAnswer: "" }), "{}", JSON.stringify({ type: "ESSAY", text: "my essay" }), 5);
    expect(r.correct).toBeNull();
    expect(r.awarded).toBe(0);
    expect(r.max).toBe(5);
  });
});

describe("scoring — MATCHING (partial credit)", () => {
  it("full credit for a full mapping", () => {
    const resp = JSON.stringify({
      type: "MATCHING",
      mapping: { p1: "Water", p2: "Salt", p3: "Carbon dioxide", p4: "Oxygen" },
    });
    const r = scoreAnswer("MATCHING", MATCH_CONTENT, "{}", resp, 4);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(4);
  });
  it("half credit for 2 of 4 pairs", () => {
    const resp = JSON.stringify({ type: "MATCHING", mapping: { p1: "Water", p2: "Pepper", p3: "Carbon dioxide", p4: "Chlorine" } });
    const r = scoreAnswer("MATCHING", MATCH_CONTENT, "{}", resp, 4);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(2);
  });
  it("one of four pairs on 3 points → 0.75 (rounding check)", () => {
    const resp = JSON.stringify({ type: "MATCHING", mapping: { p1: "Water", p2: "nope", p3: "nope", p4: "nope" } });
    const r = scoreAnswer("MATCHING", MATCH_CONTENT, "{}", resp, 3);
    expect(r.awarded).toBe(0.75);
  });
  it("case-insensitive right-hand matching", () => {
    const resp = JSON.stringify({ type: "MATCHING", mapping: { p1: "water" } });
    const r = scoreAnswer("MATCHING", MATCH_CONTENT, "{}", resp, 4);
    expect(r.detail.find((d) => d.part === "H2O")?.ok).toBe(true);
  });
  it("empty mapping → zero, finite", () => {
    const r = scoreAnswer("MATCHING", MATCH_CONTENT, "{}", JSON.stringify({ type: "MATCHING", mapping: {} }), 4);
    expect(r.awarded).toBe(0);
    expect(Number.isFinite(r.awarded)).toBe(true);
  });
});

describe("scoring — ORDERING", () => {
  it("correct order full points", () => {
    const r = scoreAnswer("ORDERING", "{}", ORDER_KEY, JSON.stringify({ type: "ORDERING", order: ["s1", "s2", "s3", "s4"] }), 2);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(2);
  });
  it("wrong order zero", () => {
    const r = scoreAnswer("ORDERING", "{}", ORDER_KEY, JSON.stringify({ type: "ORDERING", order: ["s4", "s3", "s2", "s1"] }), 2);
    expect(r.correct).toBe(false);
    expect(r.awarded).toBe(0);
  });
  it("incomplete order zero", () => {
    const r = scoreAnswer("ORDERING", "{}", ORDER_KEY, JSON.stringify({ type: "ORDERING", order: ["s1"] }), 2);
    expect(r.correct).toBe(false);
  });
});

describe("scoring — FILL_BLANK (partial credit + normalization)", () => {
  it("full credit for both blanks (case-insensitive, multi-accepted)", () => {
    const resp = JSON.stringify({ type: "FILL_BLANK", values: { b1: "mitochondria", b2: "OSMOSIS" } });
    const r = scoreAnswer("FILL_BLANK", "{}", FILL_KEY, resp, 2);
    expect(r.correct).toBe(true);
    expect(r.awarded).toBe(2);
  });
  it("half credit for one blank", () => {
    const resp = JSON.stringify({ type: "FILL_BLANK", values: { b1: "mitochondria", b2: "diffusion" } });
    const r = scoreAnswer("FILL_BLANK", "{}", FILL_KEY, resp, 2);
    expect(r.awarded).toBe(1);
  });
});

describe("scoring — robustness guarantees (no NaN / Infinity / throw)", () => {
  const TYPES = ["MCQ_SINGLE","MCQ_MULTI","TRUE_FALSE","SHORT_ANSWER","NUMERIC","ESSAY","MATCHING","ORDERING","FILL_BLANK"] as const;
  const BAD_RESPONSES = [
    null,
    "null",
    "not json at all",
    "{}",
    JSON.stringify({ type: "MCQ_SINGLE", selected: null }),
    JSON.stringify({ type: "NUMERIC", value: "not-a-number" }),
  ];
  it("never throws and always yields finite awarded/max for malformed content, keys and responses", () => {
    for (const type of TYPES) {
      for (const resp of BAD_RESPONSES) {
        const r = scoreAnswer(type, "garbage{{", "also garbage", resp, 1);
        expect(Number.isFinite(r.awarded), `${type} awarded finite`).toBe(true);
        expect(Number.isFinite(r.max), `${type} max finite`).toBe(true);
        expect(r.correct === null || typeof r.correct === "boolean").toBe(true);
      }
    }
  });
  it("unknown question type returns null correctness with zero finite award", () => {
    const r = scoreAnswer("TELEPATHY", "{}", "{}", null, 5);
    expect(r.correct).toBeNull();
    expect(r.awarded).toBe(0);
  });
  it("REGRESSION (historical undefined-points bug): non-finite points are contained upstream", () => {
    // The raw engine mirrors whatever `points` it is given (NaN in → NaN out),
    // so the API layer must normalize. This test documents the contract that
    // the submit route enforces `it.points ?? question.points ?? 1` and then
    // `Number.isFinite` guards on the totals — see the integration suite
    // (exams.test.ts, "undefined question-points regression") which proves it
    // end-to-end against a null-points assessment item.
    const r = scoreAnswer("MCQ_SINGLE", MCQ1_CONTENT, MCQ1_KEY, JSON.stringify({ type: "MCQ_SINGLE", selected: ["opt2"] }), Number.NaN);
    expect(Number.isNaN(r.awarded)).toBe(true);
  });
});

describe("isAnswered", () => {
  it("detects answered state per type", () => {
    expect(isAnswered("MCQ_SINGLE", JSON.stringify({ type: "MCQ_SINGLE", selected: ["a"] }))).toBe(true);
    expect(isAnswered("MCQ_SINGLE", JSON.stringify({ type: "MCQ_SINGLE", selected: [] }))).toBe(false);
    expect(isAnswered("TRUE_FALSE", JSON.stringify({ type: "TRUE_FALSE", selected: false }))).toBe(true);
    expect(isAnswered("TRUE_FALSE", null)).toBe(false);
    expect(isAnswered("SHORT_ANSWER", JSON.stringify({ type: "SHORT_ANSWER", text: "x" }))).toBe(true);
    expect(isAnswered("SHORT_ANSWER", JSON.stringify({ type: "SHORT_ANSWER", text: " " }))).toBe(false);
    expect(isAnswered("NUMERIC", JSON.stringify({ type: "NUMERIC", value: 0 }))).toBe(true);
    expect(isAnswered("NUMERIC", JSON.stringify({ type: "NUMERIC", value: null }))).toBe(false);
    expect(isAnswered("ESSAY", JSON.stringify({ type: "ESSAY", text: "essay" }))).toBe(true);
    expect(isAnswered("MATCHING", JSON.stringify({ type: "MATCHING", mapping: { p1: "x" } }))).toBe(true);
    expect(isAnswered("ORDERING", JSON.stringify({ type: "ORDERING", order: ["a"] }))).toBe(true);
    expect(isAnswered("FILL_BLANK", JSON.stringify({ type: "FILL_BLANK", values: { b1: "y" } }))).toBe(true);
    expect(isAnswered("FILL_BLANK", JSON.stringify({ type: "FILL_BLANK", values: { b1: "" } }))).toBe(false);
  });
});

describe("publicQuestion", () => {
  it("strips the answer key, explanation, strategies and misconceptions", () => {
    const pub = publicQuestion({
      id: "q1", type: "MCQ_SINGLE", stem: "2+2?",
      content: MCQ1_CONTENT, difficulty: 2,
      estimatedSeconds: 60, points: 1, taxonomyNodeId: null, passageId: null,
    });
    expect(pub).not.toHaveProperty("answerKey");
    expect(pub).not.toHaveProperty("explanation");
    expect(pub).not.toHaveProperty("strategies");
    expect(pub).not.toHaveProperty("misconceptions");
    expect(pub.content).toEqual({ options: expect.any(Array) });
    expect(pub.id).toBe("q1");
  });
});
