import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

// Catalog: students see published courses of their org; teachers see their own too.
export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const isStaff = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN", "AUTHOR"].includes(user.role);
    const courses = await db.course.findMany({
      where: {
        ...(user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "none" }),
        ...(isStaff ? {} : { status: "PUBLISHED" }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    });
    const myEnrollments = user.role === "STUDENT" || user.role === "PARENT"
      ? await db.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true, status: true } })
      : [];
    const enrolledIds = new Set(myEnrollments.map((e) => e.courseId));
    // Lesson counts per course via one section query
    const sections = await db.courseSection.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      select: { courseId: true, _count: { select: { lessons: true } } },
    });
    const lessonByCourse = new Map<string, number>();
    for (const sec of sections) {
      lessonByCourse.set(sec.courseId, (lessonByCourse.get(sec.courseId) ?? 0) + sec._count.lessons);
    }
    return json({
      courses: courses.map((c) => ({
        id: c.id, title: c.title, description: c.description, status: c.status, format: c.format,
        estimatedHours: c.estimatedHours, ownerName: c.owner?.name ?? null,
        lessonCount: lessonByCourse.get(c.id) ?? 0,
        enrolled: enrolledIds.has(c.id), enrollmentCount: c._count.enrollments,
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireCapability("course.create");
    const parsed = z.object({
      title: z.string().min(3).max(160),
      description: z.string().max(2000).default(""),
      format: z.enum(["SELF_PACED", "INSTRUCTOR_LED", "BLENDED"]).default("SELF_PACED"),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Course title must be at least 3 characters");
    const course = await db.course.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        format: parsed.data.format,
        organizationId: user.organizationId ?? "none",
        ownerId: user.id,
        status: "DRAFT",
      },
    });
    await audit(user.id, "course.create", "course", course.id, course.title);
    return json({ course });
  });
}
