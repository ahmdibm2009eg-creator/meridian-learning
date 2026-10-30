import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";

/**
 * Teacher analytics: class performance, item analysis (p-value + point-biserial
 * discrimination where the sample supports it), at-risk indicators.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Teacher role required", 403);
    const assessmentId = req.nextUrl.searchParams.get("assessmentId");

    // ── Item analysis for one assessment ─────────────────────
    if (assessmentId) {
      const a = await db.assessment.findUnique({
        where: { id: assessmentId },
        include: { items: { orderBy: { position: "asc" }, include: { question: { include: { taxonomy: true } } } } },
      });
      if (!a || (a.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN")) {
        return fail("Assessment not found", 404);
      }
      const attempts = await db.attempt.findMany({
        where: { assessmentId, status: { in: ["SUBMITTED", "GRADED"] } },
        include: { answers: true },
      });
      const n = attempts.length;
      const totalScores = attempts.map((t) => t.score ?? 0);
      const meanScore = n ? totalScores.reduce((x, y) => x + y, 0) / n : 0;
      const maxScore = attempts[0]?.maxScore ?? 0;

      const items = a.items.map((it) => {
        const answers = attempts.map((t) => t.answers.find((x) => x.questionId === it.questionId)).filter(Boolean);
        const scored = answers.filter((x) => x!.isCorrect !== null);
        const correctCount = scored.filter((x) => x!.isCorrect === true).length;
        const p = scored.length ? correctCount / scored.length : null;
        let discrimination: number | null = null;
        if (n >= 8 && p !== null) {
          // Point-biserial between item score (0/1) and total score
          const itemVals: number[] = attempts.map((t) => {
            const ans = t.answers.find((x) => x.questionId === it.questionId);
            return ans?.isCorrect === true ? 1 : 0;
          });
          const meanItem = itemVals.reduce((x, y) => x + y, 0) / n;
          const sdItem = Math.sqrt(itemVals.reduce((x, y) => x + (y - meanItem) ** 2, 0) / n);
          const sdTotal = Math.sqrt(totalScores.reduce((x, y) => x + (y - meanScore) ** 2, 0) / n);
          if (sdItem > 0 && sdTotal > 0) {
            const cov = itemVals.reduce((x, v, i) => x + (v - meanItem) * (totalScores[i] - meanScore), 0) / n;
            discrimination = cov / (sdItem * sdTotal);
          }
        }
        return {
          questionId: it.question.id,
          position: it.position,
          type: it.question.type,
          stem: it.question.stem.slice(0, 160),
          skill: it.question.taxonomy?.name ?? null,
          difficultyLabel: it.question.difficulty,
          attempts: scored.length,
          pValue: p === null ? null : Math.round(p * 100) / 100,
          discrimination: discrimination === null ? null : Math.round(discrimination * 100) / 100,
          reliable: n >= 8,
        };
      });

      return json({
        itemAnalysis: {
          assessment: { id: a.id, title: a.title },
          attempts: n,
          meanScorePct: maxScore > 0 ? Math.round((meanScore / maxScore) * 100) : null,
          items,
        },
      });
    }

    // ── Overview across own courses ──────────────────────────
    const courses = await db.course.findMany({
      where: {
        ...(user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "none" }),
        ...(user.role === "TEACHER" ? { ownerId: user.id } : {}),
      },
      include: {
        enrollments: {
          include: {
            student: { select: { id: true, name: true } },
            lessonProgress: { where: { completed: true } },
          },
        },
        sections: { include: { lessons: { select: { id: true } } } },
        assessments: { where: { status: "PUBLISHED" }, select: { id: true, title: true } },
      },
    });

    const courseStats = await Promise.all(
      courses.map(async (c) => {
        const totalLessons = c.sections.reduce((a, s) => a + s.lessons.length, 0);
        const attempts = await db.attempt.findMany({
          where: { assessment: { courseId: c.id }, status: { in: ["SUBMITTED", "GRADED"] } },
          select: { score: true, maxScore: true, studentId: true },
        });
        const scores = attempts.filter((t) => (t.maxScore ?? 0) > 0).map((t) => (t.score! / t.maxScore!) * 100);
        const learners = c.enrollments.map((e) => {
          const pct = totalLessons ? (e.lessonProgress.length / totalLessons) * 100 : 0;
          const learnerScores = scores.filter((_, i) => attempts[i].studentId === e.student.id);
          return {
            id: e.student.id,
            name: e.student.name,
            progressPct: Math.round(pct),
            avgScore: learnerScores.length ? Math.round(learnerScores.reduce((a, b) => a + b, 0) / learnerScores.length) : null,
          };
        });
        return {
          id: c.id,
          title: c.title,
          learners: c.enrollments.length,
          medianProgress: median(learners.map((l) => l.progressPct)) ?? 0,
          completionRate: learners.length
            ? Math.round((learners.filter((l) => l.progressPct >= 100).length / learners.length) * 100)
            : 0,
          avgScorePct: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          assessmentCount: c.assessments.length,
          atRisk: learners.filter((l) => l.progressPct < 40 || (l.avgScore !== null && l.avgScore < 50)).length,
          roster: learners,
          assessments: c.assessments,
        };
      })
    );

    return json({ courses: courseStats });
  });
}

function median(vals: number[]): number | null {
  if (vals.length === 0) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
