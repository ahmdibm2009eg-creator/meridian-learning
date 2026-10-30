import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Administrator role required", 403);
    const orgWhere = user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "none" };

    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const [users, courses, questions, enrollments, attempts, practice, assessments, auditCount, orgs] =
      await Promise.all([
        db.user.findMany({
          where: user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId },
          select: { id: true, role: true, createdAt: true, organizationId: true },
        }),
        db.course.findMany({ where: orgWhere, select: { id: true, title: true, organizationId: true } }),
        db.question.groupBy({ by: ["type"], where: orgWhere, _count: true }),
        db.enrollment.findMany({ where: { course: orgWhere }, select: { courseId: true, status: true, enrolledAt: true } }),
        db.attempt.findMany({
          where: { assessment: orgWhere, submittedAt: { gte: weekAgo } },
          select: { studentId: true, score: true, maxScore: true },
        }),
        db.practiceEvent.findMany({
          where: { student: orgWhere, createdAt: { gte: weekAgo } },
          select: { studentId: true, createdAt: true },
        }),
        db.assessment.count({ where: orgWhere }),
        db.auditLog.count(),
        user.role === "SUPER_ADMIN" ? db.organization.findMany({ include: { _count: { select: { users: true, courses: true } } } }) : Promise.resolve([]),
      ]);

    const activeUserIds = new Set<string>([
      ...attempts.map((a) => a.studentId),
      ...practice.map((p) => p.studentId),
    ]);
    const recentEnrollments = enrollments.filter((e) => e.enrolledAt >= weekAgo).length;
    const enrollmentByCourse = new Map<string, number>();
    for (const e of enrollments) enrollmentByCourse.set(e.courseId, (enrollmentByCourse.get(e.courseId) ?? 0) + 1);

    const completedEnrollments = enrollments.filter((e) => e.status === "COMPLETED").length;

    return json({
      users: {
        total: users.length,
        byRole: countBy(users.map((u) => u.role)),
        active7d: activeUserIds.size,
        new7d: users.filter((u) => u.createdAt >= weekAgo).length,
      },
      courses: {
        total: courses.length,
        enrollmentByCourse: courses.map((c) => ({
          title: c.title,
          enrollments: enrollmentByCourse.get(c.id) ?? 0,
        })).sort((a, b) => b.enrollments - a.enrollments).slice(0, 12),
        completionRate: enrollments.length ? Math.round((completedEnrollments / enrollments.length) * 100) : 0,
        newEnrollments7d: recentEnrollments,
      },
      content: {
        questions: questions.reduce((a, q) => a + q._count, 0),
        questionsByType: Object.fromEntries(questions.map((q) => [q.type, q._count])),
        assessments,
      },
      activity: {
        attempts7d: attempts.length,
        practiceAnswers7d: practice.length,
        auditEvents: auditCount,
      },
      ...(user.role === "SUPER_ADMIN"
        ? {
            organizations: orgs.map((o) => ({
              id: o.id, name: o.name, slug: o.slug,
              users: o._count.users, courses: o._count.courses,
            })),
          }
        : {}),
    });
  });
}

function countBy<T extends string>(vals: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vals) out[v] = (out[v] ?? 0) + 1;
  return out;
}
