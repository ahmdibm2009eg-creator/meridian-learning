import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (user.role !== "STUDENT") return fail("Only student accounts enroll in courses", 403);
    const course = await db.course.findUnique({ where: { id } });
    if (!course || course.organizationId !== user.organizationId) return fail("Course not found", 404);
    if (course.status !== "PUBLISHED") return fail("This course is not open for enrollment", 403);
    const existing = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId: id, studentId: user.id } },
    });
    if (existing) return json({ enrollment: existing, already: true });
    const enrollment = await db.enrollment.create({ data: { courseId: id, studentId: user.id } });
    await db.notification.create({
      data: { userId: user.id, title: `Enrolled in ${course.title}`, body: "Start with the first lesson.", view: "course", viewId: id },
    });
    await audit(user.id, "course.enroll", "enrollment", enrollment.id, course.title);
    return json({ enrollment });
  });
}
