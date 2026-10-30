import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";
import { publicQuestion } from "@/lib/scoring";

// GET = full attempt state for taking (or reviewing after submission).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const attempt = await db.attempt.findUnique({
      where: { id },
      include: {
        assessment: {
          include: {
            course: { select: { id: true, title: true } },
            items: { orderBy: { position: "asc" }, include: { question: { include: { taxonomy: true } } } },
          },
        },
        answers: { orderBy: { sequence: "asc" }, include: { question: true } },
      },
    });
    if (!attempt) return fail("Attempt not found", 404);
    if (attempt.studentId !== user.id && !["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return fail("Not your attempt", 403);
    }
    const a = attempt.assessment;
    if (user.role !== "SUPER_ADMIN" && a.organizationId !== user.organizationId) return fail("Attempt not found", 404);

    const isOwner = attempt.studentId === user.id;
    const submitted = attempt.status === "SUBMITTED" || attempt.status === "GRADED";
    const canSeeKeys = submitted && (a.feedbackMode === "AFTER_SUBMIT" || a.feedbackMode === "AFTER_CLOSE");

    const passages = new Map<string, { id: string; title: string; text: string; source: string }>();
    for (const it of a.items) {
      if (it.question.passageId) {
        const p = await db.passage.findUnique({ where: { id: it.question.passageId } });
        if (p) passages.set(p.id, { id: p.id, title: p.title, text: p.text, source: p.source });
      }
    }

    const remainingSec = a.timeLimitMin
      ? Math.max(0, Math.round((attempt.startedAt.getTime() + a.timeLimitMin * 60000 - Date.now()) / 1000))
      : null;

    return json({
      attempt: {
        id: attempt.id, status: attempt.status, startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt, score: attempt.score, maxScore: attempt.maxScore,
        timeSpentSec: attempt.timeSpentSec, remainingSec,
        assessment: {
          id: a.id, title: a.title, type: a.type, timeLimitMin: a.timeLimitMin,
          passScorePct: a.passScorePct, feedbackMode: a.feedbackMode,
          shuffleOptions: a.shuffleOptions, course: a.course,
        },
        questions: a.items.map((it, i) => {
          const ans = attempt.answers.find((x) => x.questionId === it.questionId);
          const q = it.question;
          const base = {
            ...publicQuestion(q),
            position: i,
            points: it.points ?? q.points,
            taxonomyName: q.taxonomy?.name ?? null,
          };
          return {
            ...base,
            answer: {
              response: JSON.parse(ans?.response ?? "null"),
              flagged: ans?.flagged ?? false,
              eliminated: JSON.parse(ans?.eliminated ?? "[]"),
              timeSpentSec: ans?.timeSpentSec ?? 0,
              isCorrect: submitted ? ans?.isCorrect ?? null : undefined,
              pointsAwarded: submitted ? ans?.pointsAwarded ?? 0 : undefined,
            },
            // Keys are only exposed after submission when feedback allows it.
            ...(canSeeKeys || !isOwner ? {
              answerKey: JSON.parse(q.answerKey || "{}"),
              explanation: q.explanation,
              strategies: JSON.parse(q.strategies || "{}"),
              misconceptions: JSON.parse(q.misconceptions || "[]"),
            } : {}),
          };
        }),
        passages: Array.from(passages.values()),
      },
    });
  });
}

// PATCH = autosave. Upserts answers for the current (in-progress) attempt.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const attempt = await db.attempt.findUnique({ where: { id } });
    if (!attempt) return fail("Attempt not found", 404);
    if (attempt.studentId !== user.id) return fail("Not your attempt", 403);
    if (attempt.status !== "IN_PROGRESS") return fail("This attempt is already submitted", 409);

    const body = await req.json().catch(() => null);
    const updates = Array.isArray(body?.answers) ? body.answers : null;
    if (!updates) return fail("Expected { answers: [...] }");

    let saved = 0;
    for (const u of updates) {
      if (!u || typeof u.questionId !== "string") continue;
      await db.answer.updateMany({
        where: { attemptId: id, questionId: u.questionId },
        data: {
          ...(u.response !== undefined ? { response: JSON.stringify(u.response ?? null) } : {}),
          ...(typeof u.flagged === "boolean" ? { flagged: u.flagged } : {}),
          ...(Array.isArray(u.eliminated) ? { eliminated: JSON.stringify(u.eliminated) } : {}),
          ...(typeof u.timeSpentSec === "number" ? { timeSpentSec: Math.max(0, Math.round(u.timeSpentSec)) } : {}),
          ...(typeof u.usedAiHelp === "boolean" ? { usedAiHelp: u.usedAiHelp } : {}),
          ...(u.selfAssessment === "CONFIDENT" || u.selfAssessment === "UNCERTAIN" ? { selfAssessment: u.selfAssessment } : {}),
        },
      });
      saved++;
    }
    await db.attempt.update({ where: { id }, data: { autosavedAt: new Date() } });
    return json({ ok: true, saved, serverTime: new Date().toISOString() });
  });
}
