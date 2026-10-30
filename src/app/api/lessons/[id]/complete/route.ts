import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const lesson = await db.lesson.findUnique({
      where: { id },
      include: { section: { include: { course: { include: { sections: { include: { lessons: true } } } } } } },
    });
    if (!lesson) return fail("Lesson not found", 404);
    const course = lesson.section.course;
    const enrollment = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId: course.id, studentId: user.id } },
    });
    if (!enrollment) return fail("Enroll in the course before completing lessons", 403);

    const body = await req.json().catch(() => ({}));
    const timeSpent = Math.max(0, Math.min(600, Math.round(Number(body?.timeSpentMin) || 0)));
    await db.lessonProgress.upsert({
      where: { lessonId_enrollmentId: { lessonId: id, enrollmentId: enrollment.id } },
      create: { lessonId: id, enrollmentId: enrollment.id, completed: true, completedAt: new Date(), timeSpentMin: timeSpent },
      update: { completed: true, completedAt: new Date(), timeSpentMin: { increment: timeSpent } },
    });

    const progress = await db.lessonProgress.findMany({
      where: { enrollmentId: enrollment.id, completed: true },
    });
    const total = course.sections.reduce((a, s) => a + s.lessons.length, 0);
    const pct = total ? Math.round((progress.length / total) * 100) : 0;

    let courseCompleted = false;
    if (total > 0 && progress.length >= total && enrollment.status !== "COMPLETED") {
      courseCompleted = true;
      await db.enrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await db.gradeEntry.create({
        data: {
          organizationId: course.organizationId, courseId: course.id, studentId: user.id,
          itemType: "LESSON", title: `${course.title} — completion`, score: 100, maxScore: 100,
          weight: 0.1, category: "Completion", gradedBy: null,
          comment: "Completed all lessons in the course.",
        },
      });
      await db.notification.create({
        data: { userId: user.id, title: `Completed ${course.title}`, body: "Congratulations — course complete!", view: "grades" },
      });
    }
    await audit(user.id, "lesson.complete", "lesson", id);
    return json({ ok: true, progressPct: pct, courseCompleted });
  });
}
