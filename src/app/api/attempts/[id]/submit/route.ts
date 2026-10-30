import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { scoreAnswer, isAnswered } from "@/lib/scoring";
import { recordOutcome } from "@/lib/mistakes";

/**
 * POST = submit the attempt. All grading happens server-side from stored
 * responses — the client can never post a score.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const attempt = await db.attempt.findUnique({
      where: { id },
      include: {
        assessment: {
          include: {
            course: { select: { id: true, title: true, organizationId: true } },
            items: { orderBy: { position: "asc" }, include: { question: true } },
          },
        },
        answers: true,
      },
    });
    if (!attempt) return fail("Attempt not found", 404);
    if (attempt.studentId !== user.id) return fail("Not your attempt", 403);
    if (attempt.status !== "IN_PROGRESS") {
      return json({ ok: true, alreadySubmitted: true, score: attempt.score, maxScore: attempt.maxScore });
    }

    const a = attempt.assessment;
    const timeSpentSec = Math.max(1, Math.round((Date.now() - attempt.startedAt.getTime()) / 1000));

    let totalScore = 0;
    let totalMax = 0;
    let correctCount = 0;
    let answeredCount = 0;

    for (const it of a.items) {
      const ans = attempt.answers.find((x) => x.questionId === it.questionId);
      const points = it.points ?? it.question.points;
      const result = scoreAnswer(it.question.type, it.question.content, it.question.answerKey, ans?.response ?? null, points);
      const answered = isAnswered(it.question.type, ans?.response ?? null);
      if (answered) answeredCount++;
      const selfAssessment = ans?.selfAssessment ?? null;

      await db.answer.update({
        where: { id: ans!.id },
        data: {
          isCorrect: result.correct,
          pointsAwarded: result.awarded,
        },
      });

      totalScore += result.awarded;
      totalMax += points;
      if (result.correct === true) correctCount++;

      // Mistake log + skill mastery per graded item. Essays: self-assessment only.
      if (result.correct !== null || selfAssessment) {
        await recordOutcome({
          studentId: user.id,
          questionId: it.questionId,
          correct: result.correct !== null ? result.correct : selfAssessment === "CONFIDENT",
          secondsSpent: ans?.timeSpentSec ?? 0,
          usedAiHelp: ans?.usedAiHelp ?? false,
          selfAssessment: selfAssessment as "CONFIDENT" | "UNCERTAIN" | null,
        });
      }
    }

    await db.attempt.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date(), score: totalScore, maxScore: totalMax, timeSpentSec },
    });

    // Gradebook entry (teachers can moderate later)
    await db.gradeEntry.create({
      data: {
        organizationId: a.course?.organizationId ?? a.organizationId,
        courseId: a.courseId, // standalone assessments have no course
        studentId: user.id,
        assessmentId: a.id,
        itemType: "ASSESSMENT",
        title: a.title,
        score: totalScore,
        maxScore: totalMax,
        weight: a.type === "MOCK" || a.type === "EXAM" ? 2 : 1,
        category: a.type === "QUIZ" ? "Quizzes" : a.type === "MOCK" || a.type === "EXAM" ? "Exams" : "Coursework",
        gradedBy: null,
        comment: `${answeredCount}/${a.items.length} answered · ${correctCount} correct`,
      },
    });

    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const passed = pct >= a.passScorePct;
    await db.notification.create({
      data: {
        userId: user.id,
        title: `${a.title}: ${pct}%`,
        body: passed
          ? `You passed with ${pct}%. ${answeredCount} of ${a.items.length} questions answered.`
          : `You scored ${pct}%. Review your mistakes and try again — the pass mark is ${a.passScorePct}%.`,
        view: "assessments",
      },
    });
    await audit(user.id, "attempt.submit", "attempt", id, `score=${totalScore}/${totalMax}`);

    return json({
      ok: true,
      score: totalScore,
      maxScore: totalMax,
      pct,
      passed,
      correctCount,
      answeredCount,
      totalQuestions: a.items.length,
      timeSpentSec,
    });
  });
}
