import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const q = await db.question.findUnique({
      where: { id },
      include: {
        taxonomy: true, author: { select: { name: true } },
        revisions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!q) return fail("Question not found", 404);
    if (user.role !== "SUPER_ADMIN" && q.organizationId !== user.organizationId) return fail("Question not found", 404);
    const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    return json({
      question: {
        ...q,
        content: JSON.parse(q.content || "{}"), answerKey: isStaff ? JSON.parse(q.answerKey || "{}") : undefined,
        strategies: JSON.parse(q.strategies || "{}"), misconceptions: JSON.parse(q.misconceptions || "[]"),
        tags: JSON.parse(q.tags || "[]"), authorName: q.author?.name ?? null,
        revisions: q.revisions.map((r) => ({ id: r.id, version: r.version, note: r.note, createdAt: r.createdAt })),
      },
    });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireCapability("question.edit");
    const q = await db.question.findUnique({ where: { id } });
    if (!q) return fail("Question not found", 404);
    if (user.role !== "SUPER_ADMIN" && q.organizationId !== user.organizationId) return fail("Question not found", 404);
    const body = await req.json().catch(() => null);
    if (!body) return fail("Invalid request body");

    // Snapshot current version for rollback
    await db.questionRevision.create({
      data: {
        questionId: id,
        snapshot: JSON.stringify({
          stem: q.stem, content: q.content, answerKey: q.answerKey, explanation: q.explanation,
          strategies: q.strategies, misconceptions: q.misconceptions, difficulty: q.difficulty,
          estimatedSeconds: q.estimatedSeconds, taxonomyNodeId: q.taxonomyNodeId, tags: q.tags, points: q.points,
        }),
        version: q.version,
        editedBy: user.id,
      },
    });

    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const k of ["stem", "explanation", "copyrightNote", "reviewStatus"] as const) {
      if (typeof body?.[k] === "string") data[k] = body[k];
    }
    for (const k of ["content", "answerKey", "strategies"] as const) {
      if (body?.[k] && typeof body[k] === "object") data[k] = JSON.stringify(body[k]);
    }
    if (Array.isArray(body?.misconceptions)) data.misconceptions = JSON.stringify(body.misconceptions);
    if (Array.isArray(body?.tags)) data.tags = JSON.stringify(body.tags);
    if (typeof body?.difficulty === "number") data.difficulty = Math.round(body.difficulty);
    if (typeof body?.estimatedSeconds === "number") data.estimatedSeconds = Math.round(body.estimatedSeconds);
    if (typeof body?.points === "number") data.points = body.points;
    if (body?.taxonomyNodeId !== undefined) data.taxonomyNodeId = body.taxonomyNodeId;

    await db.question.update({ where: { id }, data });
    await audit(user.id, "question.update", "question", id, `v${q.version + 1}`);
    return json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await requireCapability("question.edit");
    const q = await db.question.findUnique({ where: { id } });
    if (!q) return fail("Question not found", 404);
    if (user.role !== "SUPER_ADMIN" && q.organizationId !== user.organizationId) return fail("Question not found", 404);
    const used = await db.assessmentItem.count({ where: { questionId: id } });
    if (used > 0) return fail(`This question is used by ${used} assessment(s). Remove it there first.`, 409);
    await db.question.delete({ where: { id } });
    await audit(user.id, "question.delete", "question", id);
    return json({ ok: true });
  });
}
