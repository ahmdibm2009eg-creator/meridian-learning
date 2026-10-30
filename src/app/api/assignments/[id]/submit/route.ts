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
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.slice(0, 20000) : "";
    if (!text.trim()) return fail("Write your submission first");
    const existing = await db.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: id, studentId: user.id } },
    });
    const submission = await db.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: id, studentId: user.id } },
      create: { assignmentId: id, studentId: user.id, textSubmission: text, status: "SUBMITTED" },
      update: { textSubmission: text, status: "SUBMITTED", submittedAt: new Date() },
    });
    await audit(user.id, "assignment.submit", "assignmentSubmission", submission.id);
    return json({ submission });
  });
}
