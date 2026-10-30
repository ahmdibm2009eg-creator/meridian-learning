import type { ScoreResult, QuestionResponse } from "@/lib/types";
import { selectedIds, selectedBool, textOf, valueOf, mappingOf, orderOf, valuesOf } from "@/lib/types";

// ── Normalization helpers ───────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?"'’`()]/g, "")
    .replace(/\s+/g, " ");
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Answer-key aware scoring for every question type ────────

export function scoreAnswer(
  type: string,
  contentJson: string,
  keyJson: string,
  responseRaw: string | null,
  points: number
): ScoreResult {
  const resp = parseJson<QuestionResponse | null>(responseRaw, null);
  const detail: ScoreResult["detail"] = [];

  const mk = (correct: boolean | null, awarded: number, d: ScoreResult["detail"] = detail): ScoreResult => ({
    correct, awarded, max: points, detail: d,
  });

  switch (type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI": {
      const key = parseJson<{ correct: string[] }>(keyJson, { correct: [] });
      const selected = selectedIds(resp);
      const ok = key.correct.length === selected.length && key.correct.every((c) => selected.includes(c));
      return mk(ok, ok ? points : 0, [
        { part: "selection", ok, got: selected.join(", ") || "—", expected: key.correct.join(", ") },
      ]);
    }
    case "TRUE_FALSE": {
      const key = parseJson<{ correct: boolean }>(keyJson, { correct: false });
      const selected = selectedBool(resp);
      const ok = selected === key.correct;
      return mk(ok, ok ? points : 0, [
        { part: "choice", ok, got: String(selected), expected: String(key.correct) },
      ]);
    }
    case "SHORT_ANSWER": {
      const key = parseJson<{ accepted: string[] }>(keyJson, { accepted: [] });
      const text = textOf(resp);
      const ok = key.accepted.some((a) => norm(a) === norm(text));
      return mk(ok, ok ? points : 0, [
        { part: "answer", ok, got: text || "—", expected: key.accepted[0] ?? "" },
      ]);
    }
    case "NUMERIC": {
      const key = parseJson<{ value: number; tolerance: number }>(keyJson, { value: 0, tolerance: 0 });
      const value = valueOf(resp);
      const ok = value !== null && value !== undefined && Math.abs(value - key.value) <= key.tolerance + 1e-9;
      return mk(ok, ok ? points : 0, [
        { part: "value", ok, got: value === null ? "—" : String(value), expected: `${key.value} ± ${key.tolerance}` },
      ]);
    }
    case "ESSAY": {
      // Not auto-scorable. Self-assessment (practice) or teacher grading supplies outcome.
      return mk(null, 0);
    }
    case "MATCHING": {
      const content = parseJson<{ pairs: { id: string; left: string; right: string }[] }>(contentJson, { pairs: [] });
      const mapping = mappingOf(resp);
      let hits = 0;
      for (const p of content.pairs) {
        const got = mapping[p.id] ?? "";
        const ok = norm(got) === norm(p.right);
        if (ok) hits++;
        detail.push({ part: p.left, ok, got: got || "—", expected: p.right });
      }
      const n = Math.max(content.pairs.length, 1);
      const awarded = Math.round((hits / n) * points * 100) / 100;
      return mk(hits === n, awarded);
    }
    case "ORDERING": {
      const key = parseJson<{ correctOrder: string[] }>(keyJson, { correctOrder: [] });
      const order = orderOf(resp);
      const ok = key.correctOrder.length === order.length && key.correctOrder.every((id, i) => order[i] === id);
      return mk(ok, ok ? points : 0, [
        { part: "sequence", ok, got: order.join(" → ") || "—", expected: key.correctOrder.join(" → ") },
      ]);
    }
    case "FILL_BLANK": {
      const key = parseJson<{ accepted: Record<string, string[]> }>(keyJson, { accepted: {} });
      const values = valuesOf(resp);
      const blankIds = Object.keys(key.accepted);
      let hits = 0;
      for (const id of blankIds) {
        const got = values[id] ?? "";
        const ok = (key.accepted[id] ?? []).some((a) => norm(a) === norm(got));
        if (ok) hits++;
        detail.push({ part: `blank ${id}`, ok, got: got || "—", expected: (key.accepted[id] ?? []).join(" / ") });
      }
      const n = Math.max(blankIds.length, 1);
      const awarded = Math.round((hits / n) * points * 100) / 100;
      return mk(hits === n, awarded);
    }
    default:
      return mk(null, 0);
  }
}

/** Has this response been interacted with at all (for "unanswered" detection)? */
export function isAnswered(type: string, responseRaw: string | null): boolean {
  const resp = parseJson<QuestionResponse | null>(responseRaw, null);
  if (!resp) return false;
  switch (type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI":
      return selectedIds(resp).length > 0;
    case "TRUE_FALSE":
      return selectedBool(resp) !== null;
    case "SHORT_ANSWER":
    case "ESSAY":
      return textOf(resp).trim().length > 0;
    case "NUMERIC":
      return valueOf(resp) !== null;
    case "MATCHING":
      return Object.values(mappingOf(resp)).some(Boolean);
    case "ORDERING":
      return orderOf(resp).length > 0;
    case "FILL_BLANK":
      return Object.values(valuesOf(resp)).some((v) => v.trim() !== "");
    default:
      return false;
  }
}

/** Strip the answer key and stats from a question for student-facing payloads. */
export function publicQuestion(q: {
  id: string; type: string; stem: string; content: string; difficulty: number;
  estimatedSeconds: number; points: number; taxonomyNodeId: string | null;
  passageId: string | null; tags?: string;
}) {
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    content: JSON.parse(q.content || "{}"),
    difficulty: q.difficulty,
    estimatedSeconds: q.estimatedSeconds,
    points: q.points,
    taxonomyNodeId: q.taxonomyNodeId,
    passageId: q.passageId,
    tags: JSON.parse(q.tags || "[]"),
  };
}
