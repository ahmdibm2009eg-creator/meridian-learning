import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const lesson = await db.lesson.findUnique({
      where: { id },
      include: { section: { include: { course: { select: { id: true, title: true, ownerId: true, organizationId: true } }, lessons: { orderBy: { position: "asc" }, select: { id: true, title: true } } } } },
    });
    if (!lesson) return fail("Lesson not found", 404);
    if (lesson.section.course.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN") {
      return fail("Lesson not found", 404);
    }
    const siblings = lesson.section.lessons;
    const idx = siblings.findIndex((l) => l.id === lesson.id);
    const enrollment = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId: lesson.section.course.id, studentId: user.id } },
      include: { lessonProgress: { where: { lessonId: lesson.id, completed: true } } },
    });
    return json({
      completed: enrollment ? enrollment.lessonProgress.length > 0 : undefined,
      lesson: {
        id: lesson.id, title: lesson.title, type: lesson.type, content: lesson.content,
        objectives: JSON.parse(lesson.objectives || "[]"), durationMin: lesson.durationMin,
        courseId: lesson.section.course.id, courseTitle: lesson.section.course.title,
        sectionId: lesson.sectionId, sectionTitle: lesson.section.title,
        prev: idx > 0 ? siblings[idx - 1] : null,
        next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
      },
    });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const lesson = await db.lesson.findUnique({ where: { id }, include: { section: { include: { course: true } } } });
    if (!lesson) return fail("Lesson not found", 404);
    const course = lesson.section.course;
    if (course.ownerId !== user.id && !["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return fail("You do not have permission to edit this lesson", 403);
    }
    const body = await req.json().catch(() => null);
    const data: Record<string, string> = {};
    for (const k of ["title", "content", "type"] as const) if (typeof body?.[k] === "string") data[k] = body[k];
    if (typeof body?.durationMin === "number") data.durationMin = String(Math.round(body.durationMin));
    if (Array.isArray(body?.objectives)) data.objectives = JSON.stringify(body.objectives.slice(0, 10));
    const updated = await db.lesson.update({ where: { id }, data });
    await audit(user.id, "lesson.update", "lesson", id);
    return json({ lesson: updated });
  });
}
