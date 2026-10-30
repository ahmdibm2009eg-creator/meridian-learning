import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";
import { nextReviewDate, LeitnerBoxAfter } from "@/lib/srs";

// GET = due flashcards + progress stats
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const limit = Math.max(1, Math.min(30, Math.round(Number(req.nextUrl.searchParams.get("limit")) || 15)));

    // Ensure every org word has a progress row for this student (first run).
    const orgWords = await db.vocabItem.findMany({
      where: { organizationId: user.organizationId ?? "none" },
      select: { id: true },
    });
    const existing = await db.vocabProgress.findMany({
      where: { studentId: user.id },
      select: { vocabItemId: true },
    });
    const have = new Set(existing.map((e) => e.vocabItemId));
    const missing = orgWords.filter((w) => !have.has(w.id));
    if (missing.length > 0) {
      await db.vocabProgress.createMany({
        data: missing.map((w) => ({ studentId: user.id, vocabItemId: w.id, nextReviewAt: new Date() })),
      });
    }

    const due = await db.vocabProgress.findMany({
      where: { studentId: user.id, nextReviewAt: { lte: new Date() }, status: { not: "KNOWN" } },
      include: { vocabItem: true },
      orderBy: [{ box: "asc" }, { nextReviewAt: "asc" }],
      take: limit,
    });
    const all = await db.vocabProgress.findMany({ where: { studentId: user.id } });
    return json({
      cards: due.map((d) => ({
        progressId: d.id, box: d.box, status: d.status,
        item: {
          id: d.vocabItem.id, word: d.vocabItem.word, cefr: d.vocabItem.cefr,
          partOfSpeech: d.vocabItem.partOfSpeech, definition: d.vocabItem.definition,
          arabicMeaning: d.vocabItem.arabicMeaning, example: d.vocabItem.example,
          synonyms: JSON.parse(d.vocabItem.synonyms || "[]"),
        },
      })),
      stats: {
        total: all.length,
        known: all.filter((p) => p.status === "KNOWN").length,
        uncertain: all.filter((p) => p.status === "UNCERTAIN").length,
        due: all.filter((p) => p.nextReviewAt <= new Date() && p.status !== "KNOWN").length,
      },
    });
  });
}

// POST = review one card (Leitner scheduling)
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.progressId !== "string") return fail("progressId required");
    const outcome = ["known", "uncertain", "unknown"].includes(body.outcome) ? body.outcome : null;
    if (!outcome) return fail("outcome must be known | uncertain | unknown");
    const p = await db.vocabProgress.findUnique({ where: { id: body.progressId } });
    if (!p || p.studentId !== user.id) return fail("Card not found", 404);

    const wasCorrect = outcome === "known";
    const box = LeitnerBoxAfter(p.box, wasCorrect);
    const status = outcome === "known" ? (box >= 4 ? "KNOWN" : "UNCERTAIN") : outcome === "uncertain" ? "UNCERTAIN" : "UNKNOWN";
    await db.vocabProgress.update({
      where: { id: p.id },
      data: {
        box,
        status,
        nextReviewAt: nextReviewDate(box, wasCorrect),
        reviewCount: { increment: 1 },
        streak: wasCorrect ? { increment: 1 } : 0,
      },
    });
    return json({ ok: true, nextBox: box, nextReviewAt: nextReviewDate(box, wasCorrect) });
  });
}
