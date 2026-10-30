import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const courseId = req.nextUrl.searchParams.get("courseId");
    const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);

    const assessments = await db.assessment.findMany({
      where: {
        ...(user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "none" }),
        ...(courseId ? { courseId } : {}),
        ...(isStaff ? {} : { status: "PUBLISHED" }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { items: true } },
      },
    });

    const myAttempts = await db.attempt.findMany({
      where: { studentId: user.id },
      select: { assessmentId: true, status: true, score: true, maxScore: true, submittedAt: true },
    });
    const byAssessment = new Map<string, typeof myAttempts>();
    for (const a of myAttempts) {
      const list = byAssessment.get(a.assessmentId) ?? [];
      list.push(a);
      byAssessment.set(a.assessmentId, list);
    }

    const enrolledCourses = user.role === "STUDENT"
      ? (await db.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true } })).map((e) => e.courseId)
      : [];

    return json({
      assessments: assessments
        .filter((a) => isStaff || !a.courseId || enrolledCourses.includes(a.courseId))
        .map((a) => {
          const attempts = byAssessment.get(a.id) ?? [];
          return {
            id: a.id, title: a.title, description: a.description, type: a.type, status: a.status,
            timeLimitMin: a.timeLimitMin, attemptsAllowed: a.attemptsAllowed,
            feedbackMode: a.feedbackMode, passScorePct: a.passScorePct, availableTo: a.availableTo,
            course: a.course, questionCount: a._count.items,
            myAttempts: attempts,
            attemptsUsed: attempts.filter((t) => t.status !== "IN_PROGRESS").length,
            inProgress: attempts.some((t) => t.status === "IN_PROGRESS"),
            bestScore: attempts.reduce<number | null>((best, t) => {
              if (t.score === null || t.maxScore === null || t.maxScore === 0) return best;
              const pct = Math.round((t.score / t.maxScore) * 100);
              return best === null ? pct : Math.max(best, pct);
            }, null),
          };
        }),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireCapability("assessment.create");
    const parsed = z.object({
      title: z.string().min(3).max(200),
      description: z.string().max(2000).default(""),
      type: z.enum(["QUIZ", "EXAM", "PRACTICE_SET", "MOCK", "DIAGNOSTIC"]).default("QUIZ"),
      courseId: z.string().nullable().default(null),
      timeLimitMin: z.number().int().min(1).max(600).nullable().default(null),
      attemptsAllowed: z.number().int().min(1).max(99).default(2),
      shuffleQuestions: z.boolean().default(false),
      shuffleOptions: z.boolean().default(false),
      feedbackMode: z.enum(["AFTER_SUBMIT", "AFTER_CLOSE", "NEVER"]).default("AFTER_SUBMIT"),
      passScorePct: z.number().int().min(0).max(100).default(60),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Assessment title must be at least 3 characters");
    const d = parsed.data;
    if (d.courseId) {
      const course = await db.course.findUnique({ where: { id: d.courseId } });
      if (!course || (course.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN")) {
        return fail("Course not found", 404);
      }
    }
    const assessment = await db.assessment.create({
      data: {
        organizationId: user.organizationId ?? "none",
        title: d.title, description: d.description, type: d.type,
        courseId: d.courseId, timeLimitMin: d.timeLimitMin, attemptsAllowed: d.attemptsAllowed,
        shuffleQuestions: d.shuffleQuestions, shuffleOptions: d.shuffleOptions,
        feedbackMode: d.feedbackMode, passScorePct: d.passScorePct,
        createdBy: user.id, status: "DRAFT",
      },
    });
    await audit(user.id, "assessment.create", "assessment", assessment.id, d.title);
    return json({ assessment });
  });
}
