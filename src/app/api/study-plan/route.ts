import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { generatePlan } from "@/lib/planner";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const plan = await db.studyPlan.findFirst({
      where: { studentId: user.id, active: true },
      include: { tasks: { orderBy: { dueDate: "asc" } } },
    });
    const dueMistakes = await db.mistakeEntry.count({
      where: { studentId: user.id, status: { in: ["OPEN", "SCHEDULED"] }, retryDueAt: { lte: new Date() } },
    });
    return json({ plan, dueMistakes });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => null);
    const examDate = new Date(body?.examDate);
    if (Number.isNaN(examDate.getTime())) return fail("Pick a valid exam date");
    if (examDate.getTime() < Date.now()) return fail("The exam date must be in the future");
    const plan = await generatePlan(user.id, {
      goalExam: typeof body?.goalExam === "string" ? body.goalExam.slice(0, 60) : "SAT",
      examDate,
      targetScore: Math.max(200, Math.min(1600, Math.round(Number(body?.targetScore) || 1200))),
      weeklyHours: Math.max(1, Math.min(40, Math.round(Number(body?.weeklyHours) || 8))),
    });
    await audit(user.id, "studyplan.generate", "studyPlan", plan?.id);
    return json({ plan });
  });
}
