// Shared domain types — used by both API routes and client components.

export type Role =
  | "SUPER_ADMIN"
  | "ORG_ADMIN"
  | "TEACHER"
  | "AUTHOR"
  | "STUDENT"
  | "PARENT";

export type QuestionType =
  | "MCQ_SINGLE"
  | "MCQ_MULTI"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "NUMERIC"
  | "ESSAY"
  | "MATCHING"
  | "ORDERING"
  | "FILL_BLANK";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ_SINGLE: "Multiple choice (single)",
  MCQ_MULTI: "Multiple response",
  TRUE_FALSE: "True / False",
  SHORT_ANSWER: "Short answer",
  NUMERIC: "Numeric entry",
  ESSAY: "Extended response",
  MATCHING: "Matching",
  ORDERING: "Ordering",
  FILL_BLANK: "Fill in the blanks",
};

// ── Question content payloads (JSON-encoded in DB) ──────────

export interface MCQOption {
  id: string;
  text: string;
}

export interface MCQContent {
  options: MCQOption[];
  passageId?: string | null;
}
export interface MCQKey {
  correct: string[]; // option ids
}

export interface TrueFalseContent {
  statement?: string;
}
export interface TrueFalseKey {
  correct: boolean;
}

export type ShortAnswerContent = Record<string, unknown>;
export interface ShortAnswerKey {
  accepted: string[];
}

export interface NumericContent {
  unit?: string;
}
export interface NumericKey {
  value: number;
  tolerance: number; // absolute tolerance
}

export interface EssayContent {
  rubric: { criterion: string; points: number }[];
  modelAnswer: string;
}
export type EssayKey = Record<string, unknown>;

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}
export interface MatchingContent {
  instruction?: string;
  pairs: MatchingPair[]; // right side is shuffled at render
}
export type MatchingKey = Record<string, unknown>;

export interface OrderingContent {
  instruction?: string;
  items: { id: string; text: string }[];
}
export interface OrderingKey {
  correctOrder: string[]; // item ids in correct sequence
}

export interface FillBlankContent {
  // stem contains {{1}}, {{2}}… placeholders
  blanks: { id: string; size?: number }[];
}
export interface FillBlankKey {
  accepted: Record<string, string[]>; // blankId → accepted answers
}

export type QuestionResponse =
  | { type: "MCQ_SINGLE" | "MCQ_MULTI"; selected: string[] }
  | { type: "TRUE_FALSE"; selected: boolean }
  | { type: "SHORT_ANSWER"; text: string }
  | { type: "NUMERIC"; value: number | null }
  | { type: "ESSAY"; text: string; selfAssessment?: "CONFIDENT" | "UNCERTAIN" }
  | { type: "MATCHING"; mapping: Record<string, string> } // pairId → right text
  | { type: "ORDERING"; order: string[] }
  | { type: "FILL_BLANK"; values: Record<string, string> };

export interface ScoreResult {
  correct: boolean | null; // null = not auto-scorable (ESSAY)
  awarded: number;
  max: number;
  detail: { part: string; ok: boolean; got: string; expected: string }[];
}

export interface Strategies {
  fastest?: string;
  standard?: string;
  beginner?: string;
  alternative?: string;
  shortcut?: string;
}

export type Locale = "en" | "ar";

// Type-safe accessors for the QuestionResponse union.
// NOTE: these are fed client-supplied JSON, so every accessor validates the
// field shape at runtime — a malformed payload must degrade to "unanswered",
// never crash the server-side scoring engine.
export function selectedIds(resp: QuestionResponse | null | undefined): string[] {
  if (resp && (resp.type === "MCQ_SINGLE" || resp.type === "MCQ_MULTI") && Array.isArray(resp.selected)) {
    return resp.selected.filter((x): x is string => typeof x === "string");
  }
  return [];
}
export function selectedBool(resp: QuestionResponse | null | undefined): boolean | null {
  if (resp && resp.type === "TRUE_FALSE" && typeof resp.selected === "boolean") return resp.selected;
  return null;
}
export function textOf(resp: QuestionResponse | null | undefined): string {
  if (resp && (resp.type === "SHORT_ANSWER" || resp.type === "ESSAY") && typeof resp.text === "string") return resp.text;
  return "";
}
export function valueOf(resp: QuestionResponse | null | undefined): number | null {
  if (resp && resp.type === "NUMERIC" && typeof resp.value === "number" && Number.isFinite(resp.value)) return resp.value;
  return null;
}
export function mappingOf(resp: QuestionResponse | null | undefined): Record<string, string> {
  if (resp && resp.type === "MATCHING" && resp.mapping && typeof resp.mapping === "object" && !Array.isArray(resp.mapping)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(resp.mapping)) if (typeof v === "string") out[k] = v;
    return out;
  }
  return {};
}
export function orderOf(resp: QuestionResponse | null | undefined): string[] {
  if (resp && resp.type === "ORDERING" && Array.isArray(resp.order)) {
    return resp.order.filter((x): x is string => typeof x === "string");
  }
  return [];
}
export function valuesOf(resp: QuestionResponse | null | undefined): Record<string, string> {
  if (resp && resp.type === "FILL_BLANK" && resp.values && typeof resp.values === "object" && !Array.isArray(resp.values)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(resp.values)) if (typeof v === "string") out[k] = v;
    return out;
  }
  return {};
}

// ── Accessibility preferences ───────────────────────────────

export interface A11yPrefs {
  fontScale: number; // 0.85–1.6
  lineHeight: number; // 1.4–2.2
  letterSpacing: number; // 0–0.12em
  fontFamily: "system" | "dyslexia" | "serif";
  readingWidth: "narrow" | "comfortable" | "wide" | "full";
  theme: "light" | "dark" | "contrast";
  reducedMotion: boolean;
  simplified: boolean; // hide decorative/secondary UI
  focusMode: boolean; // dim everything except active region
  readingRuler: boolean;
  paragraphIsolation: boolean;
  underlineLinks: boolean;
  progressIndicator: boolean;
}

export const DEFAULT_PREFS: A11yPrefs = {
  fontScale: 1,
  lineHeight: 1.7,
  letterSpacing: 0,
  fontFamily: "system",
  readingWidth: "comfortable",
  theme: "light",
  reducedMotion: false,
  simplified: false,
  focusMode: false,
  readingRuler: false,
  paragraphIsolation: false,
  underlineLinks: false,
  progressIndicator: true,
}

// ── Session user (client shape) ─────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
  organizationName?: string | null;
  locale: string;
  prefs: A11yPrefs;
}

// ── Mastery ─────────────────────────────────────────────────

export interface MasteryEstimate {
  nodeId: string;
  nodeName: string;
  level: string;
  correct: number;
  incorrect: number;
  estimate: number; // posterior mean 0..1
  low: number; // 90% credible interval
  high: number;
  label: "Not yet rated" | "Developing" | "Approaching" | "Proficient" | "Strong";
  lastSeenAt: string | null;
}
