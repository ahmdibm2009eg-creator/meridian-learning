import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";
import { scoreAnswer, isAnswered } from "@/lib/scoring";
import { recordOutcome } from "@/lib/mistakes";

/**
 * POST = grade one practice answer server-side, record mastery + mistake log,
 * and only then release the answer key & explanations to the client.
 *
 * Key-release rules (exam integrity):
 *  1. The question must be APPROVED (drafts/in-review are never served).
 *  2. The student must actually submit a response — empty requests never
 *     receive key material.
 *  3. If the question is attached to a published/closed graded assessment
 *     (EXAM/MOCK/QUIZ/DIAGNOSTIC) and this student has not yet submitted an
 *     attempt containing it, key material AND per-answer correctness are
 *     withheld — otherwise the practice endpoint could be used to harvest
 *     keys before taking an exam.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.questionId !== "string") return fail("questionId is required");
    const q = await db.question.findUnique({ where: { id: body.questionId } });
    if (!q || (q.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN")) {
      return fail("Question not found", 404);
    }
    if (q.reviewStatus !== "APPROVED") return fail("Question not found", 404);

    // Guard: no grading while an exam attempt on this question is in progress.
    const activeAttempt = await db.attempt.findFirst({
      where: { studentId: user.id, status: "IN_PROGRESS" },
      include: { assessment: { include: { items: true } } },
    });
    if (activeAttempt && activeAttempt.assessment.items.some((it) => it.questionId === q.id)) {
      return fail("This question is part of an assessment in progress — finish it there.", 409);
    }

    // Exam-integrity gate (rule 3 above).
    const gradedUsage = await db.assessmentItem.findFirst({
      where: {
        questionId: q.id,
        assessment: {
          status: { in: ["PUBLISHED", "CLOSED"] },
          type: { in: ["EXAM", "MOCK", "QUIZ", "DIAGNOSTIC"] },
          organizationId: q.organizationId,
        },
      },
      select: { id: true },
    });
    let examProtected = false;
    if (gradedUsage) {
      const prior = await db.answer.findFirst({
        where: {
          questionId: q.id,
          attempt: { studentId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
        },
        select: { id: true },
      });
      examProtected = !prior;
    }

    const secondsSpent = Math.max(0, Math.min(7200, Math.round(Number(body?.secondsSpent) || 0)));
    const usedAiHelp = !!body?.usedAiHelp;
    const selfAssessment = body?.selfAssessment === "CONFIDENT" || body?.selfAssessment === "UNCERTAIN" ? body.selfAssessment : null;
    const response = body?.response ?? null;
    const result = scoreAnswer(q.type, q.content, q.answerKey, JSON.stringify(response ?? null), q.points);
    const answered = isAnswered(q.type, JSON.stringify(response ?? null));

    await db.practiceEvent.create({
      data: {
        studentId: user.id,
        questionId: q.id,
        correct: q.type === "ESSAY" ? selfAssessment === "CONFIDENT" : result.correct === true,
        seconds: secondsSpent,
        usedAiHelp,
        selfAssessment,
      },
    });

    const outcome = await recordOutcome({
      studentId: user.id,
      questionId: q.id,
      // Essays: CONFIDENT counts as a confident correct attempt; UNCERTAIN is
      // explicitly "correct but unsure" (null correctness → CORRECT_UNCERTAIN),
      // never "incorrect".
      correct: q.type === "ESSAY" ? (selfAssessment === "CONFIDENT" ? true : null) : result.correct,
      secondsSpent,
      usedAiHelp,
      selfAssessment,
    });

    const releaseKey = answered && !examProtected;
    return json({
      result: {
        ...result,
        // Correctness itself is a hint: withhold it for protected exam questions.
        correct: examProtected ? null : result.correct,
        answered,
        slow: secondsSpent > q.estimatedSeconds * 1.8,
        secondsSpent,
        targetSeconds: q.estimatedSeconds,
      },
      mistake: outcome.logged ? { category: outcome.category } : null,
      // Key released only after a real answer, and never for a pending exam question:
      ...(releaseKey
        ? {
            answerKey: JSON.parse(q.answerKey || "{}"),
            explanation: q.explanation,
            strategies: JSON.parse(q.strategies || "{}"),
            misconceptions: JSON.parse(q.misconceptions || "[]"),
          }
        : {
            keyWithheld: examProtected ? "assessment" : "unanswered",
          }),
    });
  });
}
