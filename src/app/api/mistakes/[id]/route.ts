import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { nextRetryDate } from "@/lib/srs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const entry = await db.mistakeEntry.findUnique({ where: { id } });
    if (!entry || entry.studentId !== user.id) return fail("Entry not found", 404);
    const body = await req.json().catch(() => null);

    const data: Record<string, unknown> = {};
    if (
      typeof body?.errorType === "string" &&
      ["CONCEPTUAL", "PROCEDURAL", "CARELESS", "MISREAD", "TIME", "UNCATEGORIZED"].includes(body.errorType)
    ) {
      data.errorType = body.errorType;
    }
    if (typeof body?.rootCause === "string") data.rootCause = body.rootCause.slice(0, 500);

    if (body?.action === "mastered") {
      data.status = "MASTERED";
      data.category = "MASTERED_AFTER_REVIEW";
      data.lastReviewedAt = new Date();
      data.reviewCount = { increment: 1 };
    } else if (body?.action === "reschedule") {
      data.retryDueAt = nextRetryDate(entry.reviewCount, false);
      data.lastReviewedAt = new Date();
      data.reviewCount = { increment: 1 };
      data.status = "SCHEDULED";
    }

    await db.mistakeEntry.update({ where: { id }, data });
    await audit(user.id, "mistake.update", "mistakeEntry", id, String(body?.action ?? "edit"));
    return json({ ok: true });
  });
}
