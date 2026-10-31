import { describe, it, expect } from "vitest";
import { nextReviewDate, LeitnerBoxAfter, nextRetryDate, mistakeCategoryLabel, LEITNER_INTERVALS_DAYS } from "@/lib/srs";

describe("Leitner box transitions", () => {
  it("correct answer advances one box, capped at 5", () => {
    expect(LeitnerBoxAfter(1, true)).toBe(2);
    expect(LeitnerBoxAfter(4, true)).toBe(5);
    expect(LeitnerBoxAfter(5, true)).toBe(5); // cap
  });
  it("incorrect answer resets to box 1", () => {
    expect(LeitnerBoxAfter(3, false)).toBe(1);
    expect(LeitnerBoxAfter(5, false)).toBe(1);
  });
});

describe("nextReviewDate", () => {
  it("schedules the interval for the resulting box", () => {
    const before = Date.now();
    const d = nextReviewDate(2, true); // box 2 → 3 → 7 days
    expect(d.getTime() - before).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000 - 50);
    expect(d.getTime() - before).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 1000);
  });
  it("failed reviews fall back to 1 day", () => {
    const before = Date.now();
    const d = nextReviewDate(4, false); // → box 1 → 1 day
    expect(d.getTime() - before).toBeLessThanOrEqual(24 * 3600 * 1000 + 1000);
  });
});

describe("nextRetryDate (mistake log)", () => {
  it("expands with review count: 1, 3, 7, 16, 35 days", () => {
    const expectedDays = [1, 3, 7, 16, 35];
    for (let i = 0; i < expectedDays.length; i++) {
      const before = Date.now();
      const d = nextRetryDate(i, false);
      const days = (d.getTime() - before) / (24 * 3600 * 1000);
      expect(Math.round(days)).toBe(expectedDays[i]);
    }
  });
  it("saturates at the 35-day interval for high review counts", () => {
    const before = Date.now();
    const d = nextRetryDate(99, false);
    expect(Math.round((d.getTime() - before) / (24 * 3600 * 1000))).toBe(35);
  });
  it("mastered items get the full 35-day interval", () => {
    const before = Date.now();
    const d = nextRetryDate(0, true);
    expect(Math.round((d.getTime() - before) / (24 * 3600 * 1000))).toBe(35);
  });
});

describe("intervals table", () => {
  it("matches the documented Leitner schedule", () => {
    expect(LEITNER_INTERVALS_DAYS).toEqual([0, 1, 3, 7, 16, 35]);
  });
});

describe("mistakeCategoryLabel", () => {
  it("labels every category with a human-readable string", () => {
    for (const cat of ["INDEPENDENTLY_INCORRECT", "AI_ASSISTED", "CORRECT_UNCERTAIN", "CORRECT_SLOW", "MASTERED_AFTER_REVIEW"]) {
      expect(mistakeCategoryLabel(cat).length).toBeGreaterThan(3);
    }
    expect(mistakeCategoryLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});
