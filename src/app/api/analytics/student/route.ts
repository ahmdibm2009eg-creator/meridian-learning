import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { masteryForStudent } from "@/lib/mastery";

/**
 * Student dashboard + analytics: everything derived from real stored data.
 */
export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);

    const [practiceEvents, submittedAnswers, mastery, enrollments, mistakes, dueVocab, notifications, tasks, events] =
      await Promise.all([
        db.practiceEvent.findMany({
          where: { studentId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
          orderBy: { createdAt: "asc" },
        }),
        db.answer.findMany({
          where: { attempt: { studentId: user.id, status: { in: ["SUBMITTED", "GRADED"] } }, isCorrect: { not: null } },
          include: { attempt: { select: { submittedAt: true } } },
        }),
        masteryForStudent(user.id),
        db.enrollment.findMany({
          where: { studentId: user.id, status: "ACTIVE" },
          include: {
            course: {
              include: {
                sections: { include: { lessons: { select: { id: true } } } },
              },
            },
            lessonProgress: { where: { completed: true } },
          },
        }),
        db.mistakeEntry.findMany({
          where: { studentId: user.id, status: { in: ["OPEN", "SCHEDULED"] } },
          orderBy: { retryDueAt: "asc" },
          take: 5,
          include: { question: { select: { stem: true, type: true } }, taxonomy: { select: { name: true } } },
        }),
        db.vocabProgress.count({
          where: { studentId: user.id, status: { not: "KNOWN" }, nextReviewAt: { lte: new Date() } },
        }),
        db.notification.findMany({ where: { userId: user.id, read: false }, orderBy: { createdAt: "desc" }, take: 5 }),
        db.studyTask.findMany({
          where: { studentId: user.id, status: "PENDING", dueDate: { gte: new Date(Date.now() - 864e5) } },
          orderBy: { dueDate: "asc" },
          take: 5,
        }),
        db.calendarEvent.findMany({
          where: { organizationId: user.organizationId ?? "", startAt: { gte: new Date() } },
          orderBy: { startAt: "asc" },
          take: 5,
        }),
      ]);

    // Accuracy trend by day (practice + submitted exam answers)
    const byDay = new Map<string, { correct: number; total: number }>();
    const bump = (d: Date, ok: boolean) => {
      const key = d.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { correct: 0, total: 0 };
      cur.total++;
      if (ok) cur.correct++;
      byDay.set(key, cur);
    };
    for (const e of practiceEvents) bump(e.createdAt, e.correct);
    for (const a of submittedAnswers) bump(a.attempt.submittedAt ?? a.updatedAt, a.isCorrect === true);

    const trend = Array.from(byDay.entries()).map(([date, v]) => ({
      date,
      accuracy: v.total ? Math.round((v.correct / v.total) * 100) : null,
      total: v.total,
    }));

    // Study streak: consecutive days with any activity
    const activityDays = new Set<string>([
      ...practiceEvents.map((e) => e.createdAt.toISOString().slice(0, 10)),
      ...submittedAnswers.map((a) => (a.attempt.submittedAt ?? a.updatedAt).toISOString().slice(0, 10)),
    ]);
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      if (activityDays.has(day)) streak++;
      else if (i > 0) break;
    }

    // Readiness: mean mastery weighted by evidence volume (only measured skills)
    const measured = mastery.filter((m) => m.correct + m.incorrect >= 2);
    const readiness = measured.length
      ? measured.reduce((a, m) => a + m.estimate * (m.correct + m.incorrect), 0) /
        measured.reduce((a, m) => a + m.correct + m.incorrect, 0)
      : null;
    const readinessLow = measured.length
      ? measured.reduce((a, m) => a + m.low * (m.correct + m.incorrect), 0) /
        measured.reduce((a, m) => a + m.correct + m.incorrect, 0)
      : null;
    const readinessHigh = measured.length
      ? measured.reduce((a, m) => a + m.high * (m.correct + m.incorrect), 0) /
        measured.reduce((a, m) => a + m.correct + m.incorrect, 0)
      : null;

    const minutesStudied = Math.round(
      practiceEvents.reduce((a, e) => a + e.seconds, 0) / 60 +
        submittedAnswers.length * 1.5 + // exam answers carry attempt time separately
        (await db.attempt.aggregate({
          where: { studentId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
          _sum: { timeSpentSec: true },
        }))._sum.timeSpentSec! / 60
    );

    const courses = enrollments.map((e) => {
      const total = e.course.sections.reduce((a, s) => a + s.lessons.length, 0);
      return {
        id: e.course.id,
        title: e.course.title,
        progressPct: total ? Math.round((e.lessonProgress.length / total) * 100) : 0,
        totalLessons: total,
        completedLessons: e.lessonProgress.length,
      };
    });

    const dueMistakes = await db.mistakeEntry.count({
      where: { studentId: user.id, status: { in: ["OPEN", "SCHEDULED"] }, retryDueAt: { lte: new Date() } },
    });

    // Recommended next action (explainable)
    let recommendation: { title: string; reason: string; view: string; viewId?: string } | null = null;
    const dueTask = tasks[0];
    if (dueTask) {
      recommendation = { title: dueTask.title, reason: dueTask.reason, view: "study-plan" };
    } else if (dueMistakes > 0) {
      recommendation = {
        title: `Retry ${dueMistakes} scheduled mistake${dueMistakes === 1 ? "" : "s"}`,
        reason: "Spaced repetition items are due — reviewing them now is the highest-value activity.",
        view: "mistakes",
      };
    } else if (measured.length > 0) {
      const weakest = [...measured].sort((a, b) => a.estimate - b.estimate)[0];
      recommendation = {
        title: `Practice: ${weakest.nodeName}`,
        reason: `Your lowest estimated mastery (${Math.round(weakest.estimate * 100)}%) with enough data.`,
        view: "practice",
        viewId: weakest.nodeId,
      };
    } else if (courses.length > 0) {
      const active = courses.find((c) => c.progressPct < 100) ?? courses[0];
      recommendation = { title: `Continue ${active.title}`, reason: "Pick up where you left off.", view: "course", viewId: active.id };
    }

    return json({
      trend,
      streak,
      mastery: mastery
        .filter((m) => m.correct + m.incorrect > 0)
        .sort((a, b) => a.estimate - b.estimate),
      readiness: readiness === null ? null : {
        estimate: readiness, low: readinessLow, high: readinessHigh,
        skillsMeasured: measured.length,
      },
      totals: {
        questionsAnswered: practiceEvents.length + submittedAnswers.length,
        minutesStudied,
        dueMistakes,
        dueVocab,
      },
      courses,
      recentMistakes: mistakes.map((m) => ({
        id: m.id, stem: m.question.stem.slice(0, 140), category: m.category,
        skill: m.taxonomy?.name ?? null, due: m.retryDueAt,
      })),
      unreadNotifications: notifications.length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, type: t.type, reason: t.reason })),
      upcomingEvents: events,
      recommendation,
    });
  });
}
