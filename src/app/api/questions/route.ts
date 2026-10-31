import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";
import { computeMastery } from "@/lib/mastery";

const TYPES = ["MCQ_SINGLE","MCQ_MULTI","TRUE_FALSE","SHORT_ANSWER","NUMERIC","ESSAY","MATCHING","ORDERING","FILL_BLANK"] as const;

// Question bank list with filters. Teachers/authors see keys; the list is staff-only.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    if (!isStaff) return fail("Question bank is restricted to staff", 403);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = {
      ...(user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId }),
    };
    const type = sp.get("type");
    if (type && TYPES.includes(type as (typeof TYPES)[number])) where.type = type;
    const diff = sp.get("difficulty");
    if (diff && /^\d$/.test(diff)) where.difficulty = parseInt(diff);
    const taxonomyNodeId = sp.get("skill");
    if (taxonomyNodeId) where.taxonomyNodeId = taxonomyNodeId;
    const reviewStatus = sp.get("status");
    if (reviewStatus) where.reviewStatus = reviewStatus;
    const q = sp.get("q")?.trim();
    if (q) where.stem = { contains: q };

    // Pagination: page (1-based) + pageSize (default 50, max 100). The total
    // count is returned so clients can offer "load more" without over-fetching.
    const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(sp.get("pageSize") ?? "50") || 50));

    const [questions, total] = await Promise.all([
      db.question.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          taxonomy: { select: { id: true, name: true, level: true, parent: { select: { name: true } } } },
          author: { select: { name: true } },
          _count: { select: { answers: true, assessmentItems: true } },
        },
      }),
      db.question.count({ where }),
    ]);
    return json({
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      questions: questions.map((x) => ({
        id: x.id, type: x.type, stem: x.stem, difficulty: x.difficulty,
        estimatedSeconds: x.estimatedSeconds, points: x.points, reviewStatus: x.reviewStatus,
        version: x.version, tags: JSON.parse(x.tags || "[]"), createdAt: x.createdAt,
        taxonomy: x.taxonomy, authorName: x.author?.name ?? null,
        answerKey: JSON.parse(x.answerKey || "{}"),
        content: JSON.parse(x.content || "{}"),
        explanation: x.explanation,
        strategies: JSON.parse(x.strategies || "{}"),
        misconceptions: JSON.parse(x.misconceptions || "[]"),
        taxonomyNodeId: x.taxonomyNodeId, passageId: x.passageId,
        usageCount: x._count.assessmentItems, attemptCount: x._count.answers,
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireCapability("question.create");
    const parsed = z.object({
      type: z.enum(TYPES),
      stem: z.string().min(1),
      content: z.record(z.string(), z.unknown()).default({}),
      answerKey: z.record(z.string(), z.unknown()).default({}),
      explanation: z.string().default(""),
      strategies: z.record(z.string(), z.unknown()).default({}),
      misconceptions: z.array(z.string()).default([]),
      difficulty: z.number().int().min(1).max(5).default(3),
      estimatedSeconds: z.number().int().min(10).max(3600).default(90),
      taxonomyNodeId: z.string().nullable().default(null),
      passageId: z.string().nullable().default(null),
      tags: z.array(z.string()).default([]),
      points: z.number().min(0.5).max(100).default(1),
      copyrightNote: z.string().default("Original content"),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid question data: " + parsed.error.issues[0]?.message);
    const d = parsed.data;
    // ESSAY and MATCHING keys are legitimately empty: essays are not
    // auto-scorable, and MATCHING correctness derives from the content pairs.
    if (d.type !== "ESSAY" && d.type !== "MATCHING" && (d.answerKey === null || Object.keys(d.answerKey).length === 0)) {
      return fail("This question type needs an answer key");
    }
    // Referenced taxonomy node / passage must belong to the caller's organization.
    if (d.taxonomyNodeId) {
      const node = await db.taxonomyNode.findUnique({ where: { id: d.taxonomyNodeId } });
      if (!node || (user.role !== "SUPER_ADMIN" && node.organizationId !== user.organizationId)) {
        return fail("Taxonomy node not found", 404);
      }
    }
    if (d.passageId) {
      const passage = await db.passage.findUnique({ where: { id: d.passageId } });
      if (!passage || (user.role !== "SUPER_ADMIN" && passage.organizationId !== user.organizationId)) {
        return fail("Passage not found", 404);
      }
    }
    if (!user.organizationId && user.role !== "SUPER_ADMIN") {
      return fail("Your account has no organization — ask an administrator to assign one", 400);
    }
    const question = await db.question.create({
      data: {
        organizationId: user.organizationId ?? "none",
        type: d.type, stem: d.stem,
        content: JSON.stringify(d.content), answerKey: JSON.stringify(d.answerKey),
        explanation: d.explanation, strategies: JSON.stringify(d.strategies),
        misconceptions: JSON.stringify(d.misconceptions),
        difficulty: d.difficulty, estimatedSeconds: d.estimatedSeconds,
        taxonomyNodeId: d.taxonomyNodeId, passageId: d.passageId,
        tags: JSON.stringify(d.tags), points: d.points,
        copyrightNote: d.copyrightNote, authorId: user.id, reviewStatus: "DRAFT",
      },
    });
    await audit(user.id, "question.create", "question", question.id, d.type);
    return json({ question: { id: question.id } });
  });
}
