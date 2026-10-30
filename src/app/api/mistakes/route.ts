import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const status = req.nextUrl.searchParams.get("status"); // OPEN | SCHEDULED | MASTERED
    const entries = await db.mistakeEntry.findMany({
      where: { studentId: user.id, ...(status ? { status } : {}) },
      orderBy: [{ status: "asc" }, { retryDueAt: "asc" }],
      take: 200,
      include: {
        question: {
          select: { id: true, type: true, stem: true, difficulty: true, taxonomyNodeId: true, passageId: true },
        },
        taxonomy: { select: { id: true, name: true } },
      },
    });
    const now = Date.now();
    return json({
      entries: entries.map((e) => ({
        id: e.id, category: e.category, errorType: e.errorType, rootCause: e.rootCause,
        status: e.status, retryDueAt: e.retryDueAt, reviewCount: e.reviewCount,
        lastReviewedAt: e.lastReviewedAt, createdAt: e.createdAt,
        due: e.retryDueAt ? e.retryDueAt.getTime() <= now && e.status !== "MASTERED" : false,
        taxonomy: e.taxonomy,
        question: e.question,
      })),
      counts: {
        due: entries.filter((e) => e.retryDueAt && e.retryDueAt.getTime() <= now && e.status !== "MASTERED").length,
        open: entries.filter((e) => e.status !== "MASTERED").length,
        mastered: entries.filter((e) => e.status === "MASTERED").length,
      },
    });
  });
}
