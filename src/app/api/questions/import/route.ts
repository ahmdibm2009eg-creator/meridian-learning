import { db } from "@/lib/db";
import { requireCapability, handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

const TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "NUMERIC", "ESSAY", "MATCHING", "ORDERING", "FILL_BLANK"] as const;

/**
 * Bulk import from JSON. Every item carries provenance; duplicates are
 * detected via a normalized content fingerprint (stem + type) and skipped.
 * Imports are transactional and every item lands in IN_REVIEW.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireCapability("question.create");
    if (!user.organizationId && user.role !== "SUPER_ADMIN") {
      return fail("Your account has no organization — ask an administrator to assign one", 400);
    }
    const body = await req.json().catch(() => null);
    const items = Array.isArray(body?.questions) ? (body.questions as Record<string, unknown>[]) : null;
    const source = typeof body?.source === "string" ? body.source.slice(0, 200) : "JSON import";
    if (!items) return fail('Expected { "questions": [...] }');
    if (items.length > 500) return fail("Import at most 500 questions at a time");

    const existing = await db.question.findMany({
      where: { organizationId: user.organizationId ?? "none" },
      select: { stem: true, type: true },
    });
    const seen = new Set(existing.map((e) => fingerprint(e.type, e.stem)));

    // Validate all referenced taxonomy nodes up-front (org-scoped).
    const taxonomyIds = [
      ...new Set(
        items
          .map((it: { taxonomyNodeId?: unknown }) => (typeof it?.taxonomyNodeId === "string" ? it.taxonomyNodeId : null))
          .filter((x: string | null): x is string => x !== null)
      ),
    ];
    const validTaxonomy = new Set(
      (
        await db.taxonomyNode.findMany({
          where: { id: { in: taxonomyIds }, organizationId: user.role === "SUPER_ADMIN" ? undefined : user.organizationId ?? "__none__" },
          select: { id: true },
        })
      ).map((t) => t.id)
    );

    const rows: Prisma.QuestionCreateManyInput[] = [];
    let imported = 0, duplicates = 0, flagged = 0;
    for (const it of items) {
      if (!it || typeof it.stem !== "string" || !it.stem.trim() || typeof it.type !== "string") { flagged++; continue; }
      // Type must be a real question type (previously any string was stored).
      if (!(TYPES as readonly string[]).includes(it.type)) { flagged++; continue; }
      const fp = fingerprint(it.type, it.stem);
      if (seen.has(fp)) { duplicates++; continue; }
      seen.add(fp);
      const taxonomyNodeId = typeof it.taxonomyNodeId === "string" ? it.taxonomyNodeId : null;
      if (taxonomyNodeId && !validTaxonomy.has(taxonomyNodeId)) { flagged++; continue; }
      rows.push({
        organizationId: user.organizationId ?? "none",
        type: it.type,
        stem: it.stem.trim(),
        content: JSON.stringify(it.content ?? {}),
        answerKey: JSON.stringify(it.answerKey ?? {}),
        explanation: typeof it.explanation === "string" ? it.explanation : "",
        strategies: JSON.stringify(it.strategies ?? {}),
        misconceptions: JSON.stringify(Array.isArray(it.misconceptions) ? it.misconceptions : []),
        difficulty: clampInt(it.difficulty, 1, 5, 3),
        estimatedSeconds: clampInt(it.estimatedSeconds, 10, 3600, 90),
        taxonomyNodeId,
        tags: JSON.stringify(Array.isArray(it.tags) ? it.tags : []),
        points: typeof it.points === "number" && Number.isFinite(it.points) ? Math.min(100, Math.max(0.5, it.points)) : 1,
        copyrightNote: typeof it.copyrightNote === "string" ? it.copyrightNote : source,
        authorId: user.id,
        // Human review required for every imported item (no silent publishing)
        reviewStatus: "IN_REVIEW",
      });
      imported++;
    }

    // All-or-nothing import: a mid-batch failure can no longer leave a partial set.
    if (rows.length > 0) {
      await db.$transaction(async (tx) => {
        await tx.question.createMany({ data: rows });
      });
    }
    await audit(user.id, "question.import", "question", undefined, `imported=${imported} duplicates=${duplicates} flagged=${flagged}`);
    return json({ imported, duplicates, flagged, total: items.length });
  });
}

function fingerprint(type: string, stem: string) {
  return createHash("sha1").update(`${type}::${stem.toLowerCase().replace(/\s+/g, " ").trim()}`).digest("hex");
}

function clampInt(v: unknown, min: number, max: number, dflt: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
