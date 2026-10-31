import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

const ASSESSMENT_TYPES = ["QUIZ", "EXAM", "PRACTICE_SET", "MOCK", "DIAGNOSTIC"] as const;
const ASSESSMENT_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
const FEEDBACK_MODES = ["AFTER_SUBMIT", "AFTER_CLOSE", "NEVER"] as const;
const STAFF_ROLES = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"];

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
    const isStaff = STAFF_ROLES.includes(user.role) &&
      (a.course ? a.course.ownerId === user.id || user.role === "ORG_ADMIN" || user.role === "SUPER_ADMIN" : true);
    // Drafts are authoring-only: students never see unpublished assessments.
    if (!isStaff && a.status === "DRAFT") return fail("Assessment not found", 404);

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
    if (!STAFF_ROLES.includes(user.role)) return fail("Not permitted", 403);

    const parsed = z
      .object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(4000).optional(),
        type: z.enum(ASSESSMENT_TYPES).optional(),
        status: z.enum(ASSESSMENT_STATUSES).optional(),
        feedbackMode: z.enum(FEEDBACK_MODES).optional(),
        timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
        attemptsAllowed: z.number().int().min(1).max(10).optional(),
        passScorePct: z.number().int().min(0).max(100).optional(),
        shuffleQuestions: z.boolean().optional(),
        shuffleOptions: z.boolean().optional(),
        courseId: z.string().nullable().optional(),
        items: z.array(z.object({
          questionId: z.string(),
          points: z.number().min(0.5).max(100).nullable().optional(),
        })).max(300).optional(),
      })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid assessment update: " + (parsed.error.issues[0]?.message ?? "bad data"));
    const b = parsed.data;

    // Course must belong to the caller's organization.
    if (b.courseId) {
      const course = await db.course.findUnique({ where: { id: b.courseId } });
      if (!course || (user.role !== "SUPER_ADMIN" && course.organizationId !== user.organizationId)) {
        return fail("Course not found", 404);
      }
    }
    // Every referenced question must belong to the caller's organization.
    if (b.items) {
      const ids = [...new Set(b.items.map((it) => it.questionId))];
      const found = await db.question.count({
        where: { id: { in: ids }, organizationId: user.role === "SUPER_ADMIN" ? undefined : user.organizationId ?? "__none__" },
      });
      if (found !== ids.length) return fail("One or more questions were not found in your organization", 404);
    }

    const data: Record<string, unknown> = {};
    if (b.title !== undefined) data.title = b.title;
    if (b.description !== undefined) data.description = b.description;
    if (b.type !== undefined) data.type = b.type;
    if (b.status !== undefined) data.status = b.status;
    if (b.feedbackMode !== undefined) data.feedbackMode = b.feedbackMode;
    if (b.timeLimitMin !== undefined) data.timeLimitMin = b.timeLimitMin;
    if (b.attemptsAllowed !== undefined) data.attemptsAllowed = b.attemptsAllowed;
    if (b.passScorePct !== undefined) data.passScorePct = b.passScorePct;
    if (b.shuffleQuestions !== undefined) data.shuffleQuestions = b.shuffleQuestions;
    if (b.shuffleOptions !== undefined) data.shuffleOptions = b.shuffleOptions;
    if (b.courseId !== undefined) data.courseId = b.courseId || null;

    // Item replacement is atomic: a failure mid-way can no longer destroy the list.
    await db.$transaction(async (tx) => {
      await tx.assessment.update({ where: { id }, data });
      if (b.items) {
        await tx.assessmentItem.deleteMany({ where: { assessmentId: id } });
        if (b.items.length > 0) {
          await tx.assessmentItem.createMany({
            data: b.items.map((it, i) => ({
              assessmentId: id, questionId: it.questionId, position: i,
              points: it.points ?? null,
            })),
          });
        }
      }
    });
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
    // Authoring action: staff only (previously any student could delete).
    if (!STAFF_ROLES.includes(user.role)) return fail("Not permitted", 403);
    const attempts = await db.attempt.count({ where: { assessmentId: id, status: { not: "IN_PROGRESS" } } });
    if (attempts > 0) return fail(`${attempts} submitted attempt(s) exist — archive instead of deleting.`, 409);
    await db.assessment.delete({ where: { id } });
    await audit(user.id, "assessment.delete", "assessment", id);
    return json({ ok: true });
  });
}
