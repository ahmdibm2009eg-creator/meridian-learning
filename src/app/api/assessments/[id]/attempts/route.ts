import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

// POST = start (or resume) an attempt for the current student.
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

    // Resume an in-progress attempt instead of consuming a new one.
    const inProgress = await db.attempt.findFirst({
      where: { assessmentId: id, studentId: user.id, status: "IN_PROGRESS" },
    });
    if (inProgress) {
      return json({ attemptId: inProgress.id, resumed: true });
    }

    const used = await db.attempt.count({
      where: { assessmentId: id, studentId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
    });
    if (used >= a.attemptsAllowed) return fail("You have used all attempts for this assessment", 409);

    const attempt = await db.attempt.create({ data: { assessmentId: id, studentId: user.id } });
    // Create empty answer rows up-front (doubles as the navigator order).
    await db.answer.createMany({
      data: a.items.map((it, i) => ({
        attemptId: attempt.id, questionId: it.questionId, sequence: i,
        pointsAwarded: 0,
      })),
    });
    await audit(user.id, "attempt.start", "attempt", attempt.id);
    return json({ attemptId: attempt.id, resumed: false });
  });
}
