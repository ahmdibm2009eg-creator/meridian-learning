import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const course = await db.course.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true } },
        sections: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" } } } },
        assignments: { orderBy: { dueAt: "asc" } },
        assessments: { where: { status: "PUBLISHED" }, select: { id: true, title: true, type: true } },
        announcements: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!course) return fail("Course not found", 404);
    if (user.role !== "SUPER_ADMIN" && course.organizationId !== user.organizationId) {
      return fail("Course not found", 404);
    }

    const enrollment = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId: id, studentId: user.id } },
      include: { lessonProgress: { include: { lesson: { select: { id: true } } } } },
    });
    const isTeacher = course.ownerId === user.id || ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);

    // For teachers: roster with progress
    let roster: unknown[] = [];
    if (isTeacher) {
      const enr = await db.enrollment.findMany({
        where: { courseId: id },
        include: {
          student: { select: { id: true, name: true, email: true } },
          lessonProgress: { where: { completed: true } },
        },
      });
      const totalLessons = course.sections.reduce((a, s) => a + s.lessons.length, 0);
      roster = enr.map((e) => ({
        id: e.student.id, name: e.student.name, email: e.student.email,
        status: e.status, enrolledAt: e.enrolledAt,
        completedLessons: e.lessonProgress.length,
        progressPct: totalLessons ? Math.round((e.lessonProgress.length / totalLessons) * 100) : 0,
      }));
    }

    const completedLessonIds = new Set(enrollment?.lessonProgress.filter((p) => p.completed).map((p) => p.lessonId) ?? []);
    const totalLessons = course.sections.reduce((a, s) => a + s.lessons.length, 0);
    const nextLesson = course.sections.flatMap((s) => s.lessons).find((l) => !completedLessonIds.has(l.id)) ?? null;

    return json({
      course: {
        id: course.id, title: course.title, description: course.description, status: course.status,
        format: course.format, estimatedHours: course.estimatedHours, ownerName: course.owner?.name,
        organizationId: course.organizationId, ownerId: course.ownerId,
      },
      sections: course.sections.map((s) => ({
        id: s.id, title: s.title, summary: s.summary, position: s.position,
        lessons: s.lessons.map((l) => ({
          id: l.id, title: l.title, type: l.type, durationMin: l.durationMin, position: l.position,
          completed: completedLessonIds.has(l.id),
        })),
      })),
      totalLessons,
      completedLessons: completedLessonIds.size,
      progressPct: totalLessons ? Math.round((completedLessonIds.size / totalLessons) * 100) : 0,
      enrolled: !!enrollment, isTeacher,
      nextLessonId: nextLesson?.id ?? null,
      roster,
      assignments: course.assignments,
      assessments: course.assessments,
      announcements: course.announcements,
    });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return fail("Course not found", 404);
    // Tenant isolation: ORG_ADMIN may only edit courses in their own organization.
    if (user.role !== "SUPER_ADMIN" && course.organizationId !== user.organizationId) {
      return fail("Course not found", 404);
    }
    const isTeacher = course.ownerId === user.id || ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    if (!isTeacher) return fail("You do not have permission to edit this course", 403);
    const body = await req.json().catch(() => null);
    const data: Record<string, unknown> = {};
    for (const k of ["title", "description"] as const) {
      if (typeof body?.[k] === "string") data[k] = body[k].slice(0, k === "title" ? 200 : 2000);
    }
    if (typeof body?.status === "string" && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(body.status)) data.status = body.status;
    if (typeof body?.format === "string" && ["SELF_PACED", "INSTRUCTOR_LED", "BLENDED"].includes(body.format)) data.format = body.format;
    if (typeof body?.estimatedHours === "number" && Number.isFinite(body.estimatedHours)) {
      data.estimatedHours = Math.min(1000, Math.max(0, body.estimatedHours));
    }
    const updated = await db.course.update({ where: { id }, data });
    await audit(user.id, "course.update", "course", id, JSON.stringify(data).slice(0, 200));
    return json({ course: updated });
  });
}
