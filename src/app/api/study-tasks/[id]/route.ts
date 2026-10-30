import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const task = await db.studyTask.findUnique({ where: { id } });
    if (!task || task.studentId !== user.id) return fail("Task not found", 404);
    const body = await req.json().catch(() => null);
    const status = ["PENDING", "DONE", "SKIPPED"].includes(body?.status) ? body.status : null;
    if (!status) return fail("Invalid status");
    await db.studyTask.update({
      where: { id },
      data: { status, completedAt: status === "DONE" ? new Date() : null },
    });
    return json({ ok: true });
  });
}
