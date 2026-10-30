import { db } from "@/lib/db";
import { computeMastery } from "@/lib/mastery";

/**
 * Adaptive study planner.
 *
 * Inputs: exam date, target, weekly hours + live mastery estimates.
 * Policy (deliberately explainable):
 *  - Each study day gets at most `hoursPerDay` (weeklyHours/5, capped 3h).
 *  - Day mix: ~50% weakest-skill practice, ~20% due mistake review,
 *    ~15% vocabulary, plus a full mock every 14 days and a lighter review
 *    day every 7th day.
 *  - Every task carries a human-readable `reason` explaining why it was
 *    recommended, and replanning only regenerates PENDING tasks so
 *    completed history is never lost.
 */

const DAY_MS = 24 * 3600 * 1000;

export async function generatePlan(studentId: string, opts: {
  goalExam: string;
  examDate: Date;
  targetScore: number;
  weeklyHours: number;
}) {
  const active = await db.studyPlan.findFirst({
    where: { studentId, active: true },
    include: { tasks: true },
  });
  if (active) {
    await db.studyTask.deleteMany({ where: { planId: active.id, status: "PENDING" } });
    await db.studyPlan.update({ where: { id: active.id }, data: { active: false } });
  }

  const plan = await db.studyPlan.create({
    data: {
      studentId,
      goalExam: opts.goalExam,
      examDate: opts.examDate,
      targetScore: opts.targetScore,
      weeklyHours: opts.weeklyHours,
      active: true,
    },
  });

  const stats = await db.skillStat.findMany({
    where: { studentId },
    include: { taxonomy: true },
  });
  const ranked = stats
    .map((s) => ({ node: s.taxonomy, m: computeMastery(s.correct, s.incorrect), seen: s.correct + s.incorrect }))
    .filter((r) => r.seen >= 2)
    .sort((a, b) => a.m.estimate - b.m.estimate);

  const dueMistakes = await db.mistakeEntry.count({
    where: { studentId, status: { in: ["OPEN", "SCHEDULED"] }, retryDueAt: { lte: new Date() } },
  });
  const dueVocab = await db.vocabProgress.count({
    where: { studentId, status: { not: "KNOWN" }, nextReviewAt: { lte: new Date() } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(1, Math.ceil((opts.examDate.getTime() - today.getTime()) / DAY_MS));
  const hoursPerDay = Math.min(3, Math.max(0.5, opts.weeklyHours / 5));
  const minutesPerDay = Math.round(hoursPerDay * 60);

  type TaskSeed = {
    dueDate: Date; title: string; description: string; type: string;
    reason: string; taxonomyNodeId?: string | null; estimatedMin: number;
  };
  const tasks: TaskSeed[] = [];

  for (let d = 0; d < Math.min(daysLeft, 60); d++) {
    const date = new Date(today.getTime() + d * DAY_MS);
    const dayOfWeek = date.getDay();
    let budget = minutesPerDay;

    // Full-length mock every 14 days (and 2 days before the exam)
    if ((d > 0 && d % 14 === 0) || d === Math.max(0, daysLeft - 2)) {
      tasks.push({
        dueDate: date,
        title: `Full-length ${opts.goalExam} mock exam`,
        description: "Simulate real conditions: timed, no interruptions, then review every mistake.",
        type: "MOCK",
        reason: "Regular full-length practice builds stamina and calibrates your readiness estimate.",
        estimatedMin: 130,
      });
      budget -= 130;
      continue;
    }

    // Lighter consolidation day weekly
    if (dayOfWeek === 0) {
      if (budget > 30) {
        tasks.push({
          dueDate: date,
          title: "Light review: mistake log + vocabulary",
          description: "Clear everything due in your mistake log and run your vocabulary flashcards.",
          type: "REVIEW",
          reason: "Weekly consolidation prevents forgetting; spaced repetition schedules are due today.",
          estimatedMin: Math.min(45, budget),
        });
      }
      continue;
    }

    // ~50% weakest skill practice
    if (ranked.length > 0 && budget >= 25) {
      const target = ranked[d % Math.min(3, ranked.length)];
      const mins = Math.min(40, Math.round(budget * 0.5));
      tasks.push({
        dueDate: date,
        title: `Practice: ${target.node.name}`,
        description: `Timed practice set targeting your weakest skills. Difficulty starts near your current level.`,
        type: "PRACTICE",
        reason: `${target.node.name} mastery is estimated at ${Math.round(target.m.estimate * 100)}% (range ${Math.round(target.m.low * 100)}–${Math.round(target.m.high * 100)}%) — your weakest area with enough data.`,
        taxonomyNodeId: target.node.id,
        estimatedMin: mins,
      });
      budget -= mins;
    }

    // ~25% mistake review when items are due
    if (dueMistakes > 0 && budget >= 20) {
      const mins = Math.min(30, budget);
      tasks.push({
        dueDate: date,
        title: "Retry scheduled mistakes",
        description: `About ${Math.min(10, dueMistakes)} questions are due for retry in your mistake log.`,
        type: "REVIEW",
        reason: "Items you missed previously are due for spaced repetition today.",
        estimatedMin: mins,
      });
      budget -= mins;
    }

    // ~20% vocabulary when cards are due
    if (dueVocab > 0 && budget >= 15) {
      tasks.push({
        dueDate: date,
        title: "Vocabulary flashcards",
        description: "Review the words due today — recall the meaning before flipping.",
        type: "VOCAB",
        reason: `${dueVocab} flashcard(s) are scheduled for today by your spaced-repetition queue.`,
        estimatedMin: Math.min(20, budget),
      });
    }
  }

  if (tasks.length > 0) {
    await db.studyTask.createMany({
      data: tasks.map((t) => ({
        planId: plan.id,
        studentId,
        dueDate: t.dueDate,
        title: t.title,
        description: t.description,
        type: t.type,
        reason: t.reason,
        taxonomyNodeId: t.taxonomyNodeId ?? null,
        estimatedMin: t.estimatedMin,
      })),
    });
  }

  return db.studyPlan.findUnique({
    where: { id: plan.id },
    include: { tasks: { orderBy: { dueDate: "asc" } } },
  });
}
