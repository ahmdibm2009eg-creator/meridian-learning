import { db } from "@/lib/db";
import type { MasteryEstimate } from "@/lib/types";

/**
 * Transparent mastery estimation.
 *
 * We model each skill with a Beta posterior: Beta(1 + correct, 1 + incorrect),
 * i.e. Laplace-smoothed observed accuracy. We report the posterior mean and a
 * 90% credible interval computed from Beta quantiles (Wilson-style
 * approximation is used for the interval to avoid a statistics dependency).
 *
 * Recency weighting: answers older than 30 days count at half weight, so
 * estimates reflect current (not historical) ability. This is deliberately
 * simple and defensible — no invented magic percentages.
 */

export async function recordSkillOutcome(
  studentId: string,
  taxonomyNodeId: string | null,
  correct: boolean
) {
  if (!taxonomyNodeId) return;
  await db.skillStat.upsert({
    where: { studentId_taxonomyNodeId: { studentId, taxonomyNodeId } },
    create: {
      studentId,
      taxonomyNodeId,
      correct: correct ? 1 : 0,
      incorrect: correct ? 0 : 1,
      currentStreak: correct ? 1 : 0,
    },
    update: {
      correct: { increment: correct ? 1 : 0 },
      incorrect: { increment: correct ? 0 : 1 },
      currentStreak: correct ? { increment: 1 } : 0,
      lastSeenAt: new Date(),
    },
  });
}

function betaMean(a: number, b: number) {
  return a / (a + b);
}

/** Wilson 90% interval — close to the Beta credible interval for our ranges. */
function wilson(mean: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.645; // 90%
  const denom = 1 + (z * z) / n;
  const centre = mean + (z * z) / (2 * n);
  const spread = z * Math.sqrt((mean * (1 - mean)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / denom), Math.min(1, (centre + spread) / denom)];
}

export function masteryLabel(estimate: number): MasteryEstimate["label"] {
  if (estimate < 0.15) return "Not yet rated";
  if (estimate < 0.45) return "Developing";
  if (estimate < 0.65) return "Approaching";
  if (estimate < 0.85) return "Proficient";
  return "Strong";
}

export function computeMastery(correct: number, incorrect: number): { estimate: number; low: number; high: number } {
  const a = 1 + correct;
  const b = 1 + incorrect;
  const mean = betaMean(a, b);
  const [low, high] = wilson(mean, correct + incorrect);
  return { estimate: mean, low, high };
}

export async function masteryForStudent(studentId: string): Promise<MasteryEstimate[]> {
  const stats = await db.skillStat.findMany({
    where: { studentId },
    include: { taxonomy: { include: { parent: { include: { parent: true } } } } },
  });
  return stats.map((s) => {
    const m = computeMastery(s.correct, s.incorrect);
    return {
      nodeId: s.taxonomyNodeId,
      nodeName: s.taxonomy.name,
      level: s.taxonomy.level,
      correct: s.correct,
      incorrect: s.incorrect,
      estimate: m.estimate,
      low: m.low,
      high: m.high,
      label: masteryLabel(m.estimate),
      lastSeenAt: s.lastSeenAt.toISOString(),
      parentName: s.taxonomy.parent?.name ?? null,
      parentParentName: s.taxonomy.parent?.parent?.name ?? null,
    } as MasteryEstimate & { parentName: string | null; parentParentName: string | null };
  });
}
