import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";

// GET ?courseId=… → students see own rows; teachers see the whole roster.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const courseId = req.nextUrl.searchParams.get("courseId") ?? "all";
    let isTeacher = ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    let orgId = user.organizationId ?? "";
    let courseTitle = "All results";
    if (courseId !== "all") {
      const course = await db.course.findUnique({ where: { id: courseId } });
      if (!course) return fail("Course not found", 404);
      if (course.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN") return fail("Course not found", 404);
      isTeacher = course.ownerId === user.id || isTeacher;
      orgId = course.organizationId;
      courseTitle = course.title;
    }

    const where = {
      organizationId: orgId,
      ...(courseId !== "all" ? { courseId } : {}),
      ...(isTeacher ? {} : { studentId: user.id }),
    };
    const entries = await db.gradeEntry.findMany({
      where,
      orderBy: { gradedAt: "desc" },
      include: { student: { select: { id: true, name: true } }, grader: { select: { name: true } } },
    });

    // Student totals
    const totals = new Map<string, { name: string; weighted: number; weight: number }>();
    for (const e of entries) {
      const t = totals.get(e.studentId) ?? { name: e.student.name, weighted: 0, weight: 0 };
      t.weighted += e.score * e.weight;
      t.weight += e.maxScore * e.weight;
      totals.set(e.studentId, t);
    }
    return json({
      isTeacher,
      course: { id: courseId, title: courseTitle },
      entries: entries.map((e) => ({
        id: e.id, student: e.student, itemType: e.itemType, title: e.title,
        score: e.score, maxScore: e.maxScore, weight: e.weight, category: e.category,
        comment: e.comment, gradedBy: e.grader?.name ?? null, gradedAt: e.gradedAt,
        assessmentId: e.assessmentId,
      })),
      totals: Array.from(totals.entries()).map(([studentId, t]) => ({
        studentId, name: t.name,
        weightedPct: t.weight > 0 ? Math.round((t.weighted / t.weight) * 100) : null,
      })),
    });
  });
}
