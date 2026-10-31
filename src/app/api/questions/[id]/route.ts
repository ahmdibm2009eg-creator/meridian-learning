import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

const TYPES = ["MCQ_SINGLE","MCQ_MULTI","TRUE_FALSE","SHORT_ANSWER","NUMERIC","ESSAY","MATCHING","ORDERING","FILL_BLANK"] as const;
const REVIEW_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"] as const;

/** Validate that a referenced taxonomy node / passage belongs to the org. */
async function refBelongsToOrg(
  kind: "taxonomyNode" | "passage",
  id: string | null | undefined,
  organizationId: string | null,
  isSuperAdmin: boolean
): Promise<boolean> {
  if (id === null || id === undefined || id === "") return true;
  if (kind === "taxonomyNode") {
    const row = await db.taxonomyNode.findUnique({ where: { id } });
    return !!row && (isSuperAdmin || row.organizationId === organizationId);
  }
  const row = await db.passage.findUnique({ where: { id } });
  return !!row && (isSuperAdmin || row.organizationId === organizationId);
}

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
        id: q.id, type: q.type, stem: q.stem, difficulty: q.difficulty,
        estimatedSeconds: q.estimatedSeconds, points: q.points, reviewStatus: q.reviewStatus,
        version: q.version, taxonomyNodeId: q.taxonomyNodeId, passageId: q.passageId,
        taxonomy: q.taxonomy, authorName: q.author?.name ?? null,
        // Staff see everything; students get rendering data only — the key,
        // explanation, strategies and misconceptions all reveal the answer.
        content: JSON.parse(q.content || "{}"),
        answerKey: isStaff ? JSON.parse(q.answerKey || "{}") : undefined,
        explanation: isStaff ? q.explanation : undefined,
        strategies: isStaff ? JSON.parse(q.strategies || "{}") : undefined,
        misconceptions: isStaff ? JSON.parse(q.misconceptions || "[]") : undefined,
        tags: JSON.parse(q.tags || "[]"),
        revisions: isStaff ? q.revisions.map((r) => ({ id: r.id, version: r.version, note: r.note, createdAt: r.createdAt })) : [],
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

    const parsed = z
      .object({
        stem: z.string().min(1).max(2000).optional(),
        explanation: z.string().max(8000).optional(),
        copyrightNote: z.string().max(300).optional(),
        reviewStatus: z.enum(REVIEW_STATUSES).optional(),
        content: z.record(z.string(), z.unknown()).optional(),
        answerKey: z.record(z.string(), z.unknown()).optional(),
        strategies: z.record(z.string(), z.unknown()).optional(),
        misconceptions: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        estimatedSeconds: z.number().int().min(10).max(3600).optional(),
        points: z.number().min(0.5).max(100).optional(),
        taxonomyNodeId: z.string().nullable().optional(),
        passageId: z.string().nullable().optional(),
      })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid question update: " + (parsed.error.issues[0]?.message ?? "bad data"));
    const b = parsed.data;

    // Referenced rows must exist in the caller's organization.
    if (!(await refBelongsToOrg("taxonomyNode", b.taxonomyNodeId, user.organizationId, user.role === "SUPER_ADMIN"))) {
      return fail("Taxonomy node not found", 404);
    }
    if (!(await refBelongsToOrg("passage", b.passageId, user.organizationId, user.role === "SUPER_ADMIN"))) {
      return fail("Passage not found", 404);
    }

    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (b.stem !== undefined) data.stem = b.stem;
    if (b.explanation !== undefined) data.explanation = b.explanation;
    if (b.copyrightNote !== undefined) data.copyrightNote = b.copyrightNote;
    if (b.reviewStatus !== undefined) data.reviewStatus = b.reviewStatus;
    if (b.content !== undefined) data.content = JSON.stringify(b.content);
    if (b.answerKey !== undefined) data.answerKey = JSON.stringify(b.answerKey);
    if (b.strategies !== undefined) data.strategies = JSON.stringify(b.strategies);
    if (b.misconceptions !== undefined) data.misconceptions = JSON.stringify(b.misconceptions);
    if (b.tags !== undefined) data.tags = JSON.stringify(b.tags);
    if (b.difficulty !== undefined) data.difficulty = b.difficulty;
    if (b.estimatedSeconds !== undefined) data.estimatedSeconds = b.estimatedSeconds;
    if (b.points !== undefined) data.points = b.points;
    if (b.taxonomyNodeId !== undefined) data.taxonomyNodeId = b.taxonomyNodeId || null;
    if (b.passageId !== undefined) data.passageId = b.passageId || null;

    // Snapshot + update atomically so a failure cannot bump the version
    // without preserving the rollback point.
    await db.$transaction(async (tx) => {
      await tx.questionRevision.create({
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
      await tx.question.update({ where: { id }, data });
    });
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
