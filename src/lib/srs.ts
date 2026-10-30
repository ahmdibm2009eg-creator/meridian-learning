// Spaced repetition scheduling (Leitner boxes with expanding intervals).

export const LEITNER_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35]; // index = box

export function nextReviewDate(box: number, wasCorrect: boolean): Date {
  const newBox = wasCorrect ? Math.min(5, box + 1) : 1;
  const days = LEITNER_INTERVALS_DAYS[newBox] || 1;
  return new Date(Date.now() + days * 24 * 3600 * 1000);
}

export function LeitnerBoxAfter(box: number, wasCorrect: boolean): number {
  return wasCorrect ? Math.min(5, box + 1) : 1;
}

/** Retry scheduling for the mistake log (same expanding schedule). */
export function nextRetryDate(reviewCount: number, wasMastered: boolean): Date {
  if (wasMastered) return new Date(Date.now() + 35 * 24 * 3600 * 1000);
  const idx = Math.min(reviewCount, 4);
  return new Date(Date.now() + LEITNER_INTERVALS_DAYS[idx + 1] * 24 * 3600 * 1000);
}

export function mistakeCategoryLabel(cat: string): string {
  switch (cat) {
    case "INDEPENDENTLY_INCORRECT": return "Incorrect (independent)";
    case "AI_ASSISTED": return "Needed AI assistance";
    case "CORRECT_UNCERTAIN": return "Correct but uncertain";
    case "CORRECT_SLOW": return "Correct but slow";
    case "MASTERED_AFTER_REVIEW": return "Mastered after review";
    default: return cat;
  }
}
