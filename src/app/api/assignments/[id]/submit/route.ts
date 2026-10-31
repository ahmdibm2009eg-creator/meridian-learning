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
    if (assignment.course.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN") {
      return fail("Assignment not found", 404);
    }

    const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    if (!isStaff) {
      // Students must be enrolled in the course to submit.
      const enrollment = await db.enrollment.findUnique({
        where: { courseId_studentId: { courseId: assignment.courseId, studentId: user.id } },
      });
      if (!enrollment || enrollment.status === "WITHDRAWN") {
        return fail("Enroll in the course before submitting this assignment", 403);
      }
    }

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.slice(0, 20000) : "";
    if (!text.trim()) return fail("Write your submission first");
    const existing = await db.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: id, studentId: user.id } },
    });
    // Once graded, a submission is locked until a teacher reopens it.
    if (existing?.status === "GRADED" || existing?.status === "RETURNED") {
      return fail("This submission has already been graded and is locked.", 409);
    }
    // Server-side due-date enforcement (resubmission before the deadline stays allowed).
    if (assignment.dueAt && assignment.dueAt < new Date() && !existing) {
      return fail("The deadline for this assignment has passed.", 409);
    }
    const submission = await db.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: user.id } },
      create: { assignmentId: id, studentId: user.id, textSubmission: text, status: "SUBMITTED" },
      update: { textSubmission: text, status: "SUBMITTED", submittedAt: new Date() },
    });
    await audit(user.id, "assignment.submit", "assignmentSubmission", submission.id);
    return json({ submission });
  });
}
