import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

// POST = start (or resume) an attempt for the current student.
// Start is transactional so a concurrent double-click cannot consume two of
// the allowed attempts, and course-tied assessments require enrollment.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const a = await db.assessment.findUnique({
      where: { id },
      include: { items: { orderBy: { position: "asc" }, include: { question: true } } },
    });
    if (!a) return fail("Assessment not found", 404);
    if (user.role !== "SUPER_ADMIN" && a.organizationId !== user.organizationId) return fail("Assessment not found", 404);
    if (a.status !== "PUBLISHED") return fail("This assessment is not currently open", 403);
    if (a.items.length === 0) return fail("This assessment has no questions yet", 409);
    if (a.availableTo && a.availableTo < new Date()) return fail("This assessment is no longer available", 403);

    // Course-tied assessments require an active enrollment.
    if (a.courseId) {
      const enrollment = await db.enrollment.findUnique({
        where: { courseId_studentId: { courseId: a.courseId, studentId: user.id } },
      });
      if (!enrollment || enrollment.status === "WITHDRAWN") {
        return fail("Enroll in the course before taking this assessment", 403);
      }
    }

    // Atomic start: resume-check, limit re-check and creation all happen inside
    // one transaction — SQLite serializes writers, so two concurrent requests
    // cannot both observe "no in-progress attempt" and consume two slots.
    const result = await db.$transaction(async (tx) => {
      const inProgress = await tx.attempt.findFirst({
        where: { assessmentId: id, studentId: user.id, status: "IN_PROGRESS" },
      });
      if (inProgress) return { attemptId: inProgress.id, resumed: true };

      const usedNow = await tx.attempt.count({
        where: { assessmentId: id, studentId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
      });
      if (usedNow >= a.attemptsAllowed) return null;

      const created = await tx.attempt.create({ data: { assessmentId: id, studentId: user.id } });
      // Create empty answer rows up-front (doubles as the navigator order).
      await tx.answer.createMany({
        data: a.items.map((it, i) => ({
          attemptId: created.id, questionId: it.questionId, sequence: i,
          pointsAwarded: 0,
        })),
      });
      return { attemptId: created.id, resumed: false };
    });
    if (!result) return fail("You have used all attempts for this assessment", 409);

    if (!result.resumed) await audit(user.id, "attempt.start", "attempt", result.attemptId);
    return json(result);
  });
}
