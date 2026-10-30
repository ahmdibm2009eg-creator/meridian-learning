import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";
import { publicQuestion } from "@/lib/scoring";
import { computeMastery } from "@/lib/mastery";

/**
 * POST = build a practice set. Supports:
 *  - filters: type, difficulty, taxonomyNodeId (skill), limit
 *  - mistakesOnly: only questions currently in the mistake log (due retries)
 *  - adaptive: prioritizes skills with the lowest mastery estimates
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(20, Math.round(Number(body?.limit) || 8)));

    let questionIds: string[] | null = null;
    if (body?.mistakesOnly) {
      const entries = await db.mistakeEntry.findMany({
        where: {
          studentId: user.id,
          status: { in: ["OPEN", "SCHEDULED"] },
          ...(body?.onlyDue ? { retryDueAt: { lte: new Date() } } : {}),
        },
        select: { questionId: true },
        take: 50,
      });
      questionIds = entries.map((e) => e.questionId);
      if (questionIds.length === 0) return json({ questions: [], passages: [], mistakeRetry: true });
    }

    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
      reviewStatus: "APPROVED",
      ...(questionIds ? { id: { in: questionIds } } : {}),
      ...(body?.type ? { type: body.type } : {}),
      ...(typeof body?.difficulty === "number" ? { difficulty: body.difficulty } : {}),
      ...(body?.taxonomyNodeId ? { taxonomyNodeId: body.taxonomyNodeId } : {}),
    };

    let questions = await db.question.findMany({
      where,
      include: { taxonomy: true },
      take: 200,
      orderBy: { createdAt: "asc" },
    });

    if (body?.adaptive && !questionIds) {
      const stats = (await db.skillStat.findMany({ where: { studentId: user.id } }))
        .filter((st) => st.taxonomyNodeId !== null);
      const mastery = new Map(stats.map((s) => [s.taxonomyNodeId, computeMastery(s.correct, s.incorrect).estimate]));
      // Weakest skills first; unseen skills treated as unmeasured (middle priority)
      questions = [...questions].sort((a, b) => {
        const ma = mastery.get(a.taxonomyNodeId ?? "") ?? 0.5;
        const mb = mastery.get(b.taxonomyNodeId ?? "") ?? 0.5;
        return ma - mb;
      });
    }

    const picked = questions.slice(0, limit);
    const passages = new Map<string, { id: string; title: string; text: string; source: string }>();
    for (const q of picked) {
      if (q.passageId && !passages.has(q.passageId)) {
        const p = await db.passage.findUnique({ where: { id: q.passageId } });
        if (p) passages.set(p.id, { id: p.id, title: p.title, text: p.text, source: p.source });
      }
    }
    return json({
      questions: picked.map((q) => ({ ...publicQuestion(q), taxonomyName: q.taxonomy?.name ?? null })),
      passages: Array.from(passages.values()),
      mistakeRetry: !!body?.mistakesOnly,
    });
  });
}
