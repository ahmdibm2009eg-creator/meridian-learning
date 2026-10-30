import { db } from "@/lib/db";
import { nextRetryDate } from "@/lib/srs";
import { recordSkillOutcome } from "@/lib/mastery";

export type MistakeCategory =
  | "INDEPENDENTLY_INCORRECT"
  | "AI_ASSISTED"
  | "CORRECT_UNCERTAIN"
  | "CORRECT_SLOW";

/**
 * Record one graded practice/exam outcome:
 *  - updates SkillStat (mastery)
 *  - inserts/updates the Mistake Log entry when the student did not solve
 *    the item independently (wrong, AI-assisted, uncertain, or too slow).
 */
export async function recordOutcome(opts: {
  studentId: string;
  questionId: string;
  correct: boolean | null; // null = essay self-assessment handled by caller
  category?: MistakeCategory | null;
  secondsSpent: number;
  usedAiHelp?: boolean;
  selfAssessment?: "CONFIDENT" | "UNCERTAIN" | null;
  errorType?: string;
}) {
  const q = await db.question.findUnique({
    where: { id: opts.questionId },
    select: { taxonomyNodeId: true, estimatedSeconds: true },
  });
  if (opts.correct !== null) {
    await recordSkillOutcome(opts.studentId, q?.taxonomyNodeId ?? null, opts.correct);
  }

  // Decide mistake-log category
  let category: MistakeCategory | null = opts.category ?? null;
  if (!category) {
    if (opts.usedAiHelp && opts.correct) category = "AI_ASSISTED";
    else if (opts.selfAssessment === "UNCERTAIN" && opts.correct) category = "CORRECT_UNCERTAIN";
    else if (opts.correct && opts.secondsSpent > (q?.estimatedSeconds ?? 90) * 1.8) category = "CORRECT_SLOW";
    else if (!opts.correct) category = "INDEPENDENTLY_INCORRECT";
  }

  const shouldLog =
    !opts.correct ||
    category === "AI_ASSISTED" ||
    category === "CORRECT_UNCERTAIN" ||
    category === "CORRECT_SLOW";

  if (shouldLog && q) {
    const existing = await db.mistakeEntry.findFirst({
      where: { studentId: opts.studentId, questionId: opts.questionId, status: { not: "MASTERED" } },
    });
    if (existing) {
      await db.mistakeEntry.update({
        where: { id: existing.id },
        data: {
          category: category ?? "INDEPENDENTLY_INCORRECT",
          retryDueAt: nextRetryDate(existing.reviewCount, false),
          status: "SCHEDULED",
        },
      });
    } else {
      await db.mistakeEntry.create({
        data: {
          studentId: opts.studentId,
          questionId: opts.questionId,
          category: category ?? "INDEPENDENTLY_INCORRECT",
          errorType: opts.errorType ?? "UNCATEGORIZED",
          taxonomyNodeId: q.taxonomyNodeId,
          retryDueAt: nextRetryDate(0, false),
          status: "OPEN",
        },
      });
    }
  }

  return { category, logged: shouldLog };
}
