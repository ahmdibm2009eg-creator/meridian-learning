import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const a = await db.assessment.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true, ownerId: true } },
        items: { orderBy: { position: "asc" }, include: { question: { include: { taxonomy: true } } } },
      },
    });
    if (!a) return fail("Assessment not found", 404);
    if (user.role !== "SUPER_ADMIN" && a.organizationId !== user.organizationId) return fail("Assessment not found", 404);
    const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role) &&
      (a.course ? a.course.ownerId === user.id || user.role === "ORG_ADMIN" || user.role === "SUPER_ADMIN" : true);

    return json({
      assessment: {
        id: a.id, title: a.title, description: a.description, type: a.type, status: a.status,
        timeLimitMin: a.timeLimitMin, attemptsAllowed: a.attemptsAllowed,
        shuffleQuestions: a.shuffleQuestions, shuffleOptions: a.shuffleOptions,
        feedbackMode: a.feedbackMode, passScorePct: a.passScorePct, courseId: a.courseId,
        course: a.course,
        items: a.items.map((it) => ({
          id: it.id, position: it.position, points: it.points ?? it.question.points,
          question: {
            id: it.question.id, type: it.question.type, stem: it.question.stem,
            difficulty: it.question.difficulty, estimatedSeconds: it.question.estimatedSeconds,
            taxonomy: it.question.taxonomy ? { id: it.question.taxonomy.id, name: it.question.taxonomy.name } : null,
            reviewStatus: it.question.reviewStatus,
            ...(isStaff ? {
              content: JSON.parse(it.question.content || "{}"),
              answerKey: JSON.parse(it.question.answerKey || "{}"),
            } : {}),
          },
        })),
      },
      isStaff,
    });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const a = await db.assessment.findUnique({ where: { id } });
    if (!a) return fail("Assessment not found", 404);
    if (user.role !== "SUPER_ADMIN" && a.organizationId !== user.organizationId) return fail("Assessment not found", 404);
    if (!["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Not permitted", 403);

    const body = await req.json().catch(() => null);
    const data: Record<string, unknown> = {};
    for (const k of ["title", "description", "type", "status", "feedbackMode"] as const) {
      if (typeof body?.[k] === "string") data[k] = body[k];
    }
    for (const k of ["timeLimitMin", "attemptsAllowed", "passScorePct"] as const) {
      if (typeof body?.[k] === "number") data[k] = Math.round(body[k]);
    }
    for (const k of ["shuffleQuestions", "shuffleOptions"] as const) {
      if (typeof body?.[k] === "boolean") data[k] = body[k];
    }
    if (body?.courseId !== undefined) data.courseId = body.courseId || null;
    await db.assessment.update({ where: { id }, data });

    // Replace item list if provided: [{questionId, points}]
    if (Array.isArray(body?.items)) {
      await db.assessmentItem.deleteMany({ where: { assessmentId: id } });
      const items = body.items.filter((it: { questionId?: string }) => typeof it?.questionId === "string");
      if (items.length > 0) {
        await db.assessmentItem.createMany({
          data: items.map((it: { questionId: string; points?: number }, i: number) => ({
            assessmentId: id, questionId: it.questionId, position: i,
            points: typeof it.points === "number" ? it.points : null,
          })),
        });
      }
    }
    await audit(user.id, "assessment.update", "assessment", id);
    return json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const a = await db.assessment.findUnique({ where: { id } });
    if (!a) return fail("Assessment not found", 404);
    if (user.role !== "SUPER_ADMIN" && a.organizationId !== user.organizationId) return fail("Assessment not found", 404);
    const attempts = await db.attempt.count({ where: { assessmentId: id, status: { not: "IN_PROGRESS" } } });
    if (attempts > 0) return fail(`${attempts} submitted attempt(s) exist — archive instead of deleting.`, 409);
    await db.assessment.delete({ where: { id } });
    await audit(user.id, "assessment.delete", "assessment", id);
    return json({ ok: true });
  });
}
