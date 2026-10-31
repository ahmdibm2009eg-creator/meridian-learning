import { describe, it, expect } from "vitest";
import { computeMastery, masteryLabel } from "@/lib/mastery";

describe("computeMastery (Beta posterior + Wilson interval)", () => {
  it("no data → 0.5 estimate with full uncertainty", () => {
    const m = computeMastery(0, 0);
    expect(m.estimate).toBeCloseTo(0.5);
    expect(m.low).toBe(0);
    expect(m.high).toBe(1);
  });
  it("all correct → high estimate, interval within [0,1]", () => {
    const m = computeMastery(20, 0);
    expect(m.estimate).toBeGreaterThan(0.9);
    expect(m.low).toBeGreaterThanOrEqual(0);
    expect(m.high).toBeLessThanOrEqual(1);
    expect(m.low).toBeLessThan(m.estimate);
    expect(m.high).toBeGreaterThan(m.estimate);
  });
  it("all incorrect → low estimate", () => {
    const m = computeMastery(0, 20);
    expect(m.estimate).toBeLessThan(0.1);
  });
  it("is monotonic in the correct count", () => {
    expect(computeMastery(9, 1).estimate).toBeGreaterThan(computeMastery(5, 5).estimate);
    expect(computeMastery(5, 5).estimate).toBeGreaterThan(computeMastery(1, 9).estimate);
  });
  it("interval narrows with more data", () => {
    const small = computeMastery(5, 5);
    const large = computeMastery(50, 50);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });
  it("never emits NaN or out-of-range values", () => {
    for (let c = 0; c <= 30; c += 7) {
      for (let i = 0; i <= 30; i += 7) {
        const m = computeMastery(c, i);
        expect(Number.isFinite(m.estimate)).toBe(true);
        expect(Number.isFinite(m.low)).toBe(true);
        expect(Number.isFinite(m.high)).toBe(true);
        expect(m.estimate).toBeGreaterThanOrEqual(0);
        expect(m.estimate).toBeLessThanOrEqual(1);
        expect(m.low).toBeLessThanOrEqual(m.high);
      }
    }
  });
});

describe("masteryLabel thresholds", () => {
  it("maps estimates onto the five labels", () => {
    expect(masteryLabel(0.05)).toBe("Not yet rated");
    expect(masteryLabel(0.3)).toBe("Developing");
    expect(masteryLabel(0.55)).toBe("Approaching");
    expect(masteryLabel(0.75)).toBe("Proficient");
    expect(masteryLabel(0.95)).toBe("Strong");
  });
});
