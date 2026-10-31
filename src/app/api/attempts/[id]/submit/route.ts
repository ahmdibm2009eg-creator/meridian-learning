import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { scoreAnswer, isAnswered } from "@/lib/scoring";
import { recordOutcome } from "@/lib/mistakes";

/**
 * POST = submit the attempt. All grading happens server-side from stored
 * responses — the client can never post a score.
 *
 * Concurrency & integrity contract:
 *  - The attempt is claimed atomically (conditional updateMany inside a
 *    transaction); concurrent duplicate submits see `alreadySubmitted` and
 *    perform no writes (no duplicate gradebook rows, notifications or
 *    mistake-log double counting).
 *  - A time limit is enforced: if the attempt expired, the last autosaved
 *    state is graded as-is (autosave refuses writes past the deadline).
 *  - Items added to the assessment after the attempt started have no answer
 *    row and are skipped instead of crashing.
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
    if (user.role !== "SUPER_ADMIN" && attempt.assessment.organizationId !== user.organizationId) {
      return fail("Attempt not found", 404);
    }
    if (attempt.status !== "IN_PROGRESS") {
      return json({ ok: true, alreadySubmitted: true, score: attempt.score, maxScore: attempt.maxScore });
    }

    const a = attempt.assessment;
    const now = Date.now();
    const expired = !!(a.timeLimitMin && now > attempt.startedAt.getTime() + a.timeLimitMin * 60000 + 5000);
    const elapsedSec = Math.max(1, Math.round((now - attempt.startedAt.getTime()) / 1000));
    const timeSpentSec = a.timeLimitMin ? Math.min(elapsedSec, a.timeLimitMin * 60 + 5) : elapsedSec;

    let totalScore = 0;
    let totalMax = 0;
    let correctCount = 0;
    let answeredCount = 0;

    const answerUpdates: { id: string; data: { isCorrect: boolean | null; pointsAwarded: number } }[] = [];
    const outcomes: {
      studentId: string; questionId: string; correct: boolean | null;
      secondsSpent: number; usedAiHelp: boolean; selfAssessment: string | null;
    }[] = [];

    for (const it of a.items) {
      const ans = attempt.answers.find((x) => x.questionId === it.questionId);
      // Item added after the attempt started: no answer row exists — grade as
      // unanswered instead of crashing (`ans!.id` non-null assertion removed).
      if (!ans) {
        totalMax += it.points ?? it.question.points ?? 1;
        continue;
      }
      // Regression guard for the historical undefined-points bug: item points
      // fall back to the question's points, then to a safe default.
      const points = it.points ?? it.question.points ?? 1;
      const result = scoreAnswer(it.question.type, it.question.content, it.question.answerKey, ans.response, points);
      const answered = isAnswered(it.question.type, ans.response);
      if (answered) answeredCount++;
      const selfAssessment = ans.selfAssessment ?? null;

      answerUpdates.push({
        id: ans.id,
        data: { isCorrect: result.correct, pointsAwarded: result.awarded },
      });

      totalScore += result.awarded;
      totalMax += points;
      if (result.correct === true) correctCount++;

      // Mistake log + skill mastery per graded item. Essays: self-assessment only.
      if (result.correct !== null || selfAssessment) {
        outcomes.push({
          studentId: user.id,
          questionId: it.questionId,
          correct: result.correct !== null ? result.correct : selfAssessment === "CONFIDENT",
          secondsSpent: ans.timeSpentSec ?? 0,
          usedAiHelp: ans.usedAiHelp ?? false,
          selfAssessment,
        });
      }
    }

    // Normalize the totals — the API must never emit NaN/Infinity.
    if (!Number.isFinite(totalScore)) totalScore = 0;
    if (!Number.isFinite(totalMax)) totalMax = 0;

    const claimed = await db.$transaction(async (tx) => {
      // Atomic claim: exactly one concurrent submitter wins.
      const claim = await tx.attempt.updateMany({
        where: { id, status: "IN_PROGRESS" },
        data: { status: "SUBMITTED", submittedAt: new Date(), timeSpentSec },
      });
      if (claim.count === 0) return false;
      for (const u of answerUpdates) {
        await tx.answer.update({ where: { id: u.id }, data: u.data });
      }
      await tx.attempt.update({ where: { id }, data: { score: totalScore, maxScore: totalMax } });
      // Gradebook: one entry per (assessment, student) — a retake replaces the
      // previous entry instead of stacking duplicates.
      await tx.gradeEntry.deleteMany({
        where: { assessmentId: a.id, studentId: user.id, itemType: "ASSESSMENT" },
      });
      await tx.gradeEntry.create({
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
      return true;
    });

    if (!claimed) {
      return json({ ok: true, alreadySubmitted: true, score: totalScore, maxScore: totalMax });
    }

    // Post-transaction side effects (mastery, notifications, audit).
    for (const o of outcomes) {
      await recordOutcome({
        studentId: o.studentId,
        questionId: o.questionId,
        correct: o.correct,
        secondsSpent: o.secondsSpent,
        usedAiHelp: o.usedAiHelp,
        selfAssessment: o.selfAssessment as "CONFIDENT" | "UNCERTAIN" | null,
      });
    }

    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const passed = pct >= a.passScorePct;
    await db.notification.create({
      data: {
        userId: user.id,
        title: `${a.title}: ${pct}%`,
        body: expired
          ? `Time expired — your latest saved answers were graded automatically. You scored ${pct}%.`
          : passed
            ? `You passed with ${pct}%. ${answeredCount} of ${a.items.length} questions answered.`
            : `You scored ${pct}%. Review your mistakes and try again — the pass mark is ${a.passScorePct}%.`,
        view: "assessments",
      },
    });
    await audit(user.id, "attempt.submit", "attempt", id, `score=${totalScore}/${totalMax}${expired ? " (expired)" : ""}`);

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
      expired,
    });
  });
}
