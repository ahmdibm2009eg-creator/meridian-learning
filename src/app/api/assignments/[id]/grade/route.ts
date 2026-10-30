import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const assignment = await db.assignment.findUnique({ where: { id }, include: { course: true } });
    if (!assignment) return fail("Assignment not found", 404);
    const course = assignment.course;
    if (course.ownerId !== user.id && !["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return fail("You do not have permission to grade this assignment", 403);
    }
    const body = await req.json().catch(() => null);
    const studentId = typeof body?.studentId === "string" ? body.studentId : null;
    const grade = Number(body?.grade);
    if (!studentId || !Number.isFinite(grade) || grade < 0 || grade > assignment.points) {
      return fail("Provide the student and a grade between 0 and the assignment points");
    }
    const submission = await db.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: id, studentId } },
    });
    if (!submission) return fail("No submission from this student yet", 404);
    const feedback = typeof body?.feedback === "string" ? body.feedback.slice(0, 4000) : "";
    await db.assignmentSubmission.update({
      where: { id: submission.id },
      data: { grade, feedback, status: "GRADED", gradedBy: user.id, gradedAt: new Date() },
    });
    await db.gradeEntry.create({
      data: {
        organizationId: course.organizationId, courseId: course.id, studentId,
        assignmentId: id, itemType: "ASSIGNMENT", title: assignment.title,
        score: grade, maxScore: assignment.points, weight: 1, category: "Assignments",
        gradedBy: user.id, comment: feedback,
      },
    });
    await db.notification.create({
      data: {
        userId: studentId,
        title: `Graded: ${assignment.title}`,
        body: `You received ${grade}/${assignment.points}. ${feedback.slice(0, 100)}`,
        view: "grades",
      },
    });
    await audit(user.id, "assignment.grade", "assignmentSubmission", submission.id, `${grade}/${assignment.points}`);
    return json({ ok: true });
  });
}
