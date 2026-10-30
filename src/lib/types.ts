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

// Type-safe accessors for the QuestionResponse union
export function selectedIds(resp: QuestionResponse | null | undefined): string[] {
  if (resp && (resp.type === "MCQ_SINGLE" || resp.type === "MCQ_MULTI")) return resp.selected;
  return [];
}
export function selectedBool(resp: QuestionResponse | null | undefined): boolean | null {
  if (resp && resp.type === "TRUE_FALSE") return resp.selected;
  return null;
}
export function textOf(resp: QuestionResponse | null | undefined): string {
  if (resp && (resp.type === "SHORT_ANSWER" || resp.type === "ESSAY")) return resp.text;
  return "";
}
export function valueOf(resp: QuestionResponse | null | undefined): number | null {
  if (resp && resp.type === "NUMERIC") return resp.value;
  return null;
}
export function mappingOf(resp: QuestionResponse | null | undefined): Record<string, string> {
  if (resp && resp.type === "MATCHING") return resp.mapping;
  return {};
}
export function orderOf(resp: QuestionResponse | null | undefined): string[] {
  if (resp && resp.type === "ORDERING") return resp.order;
  return [];
}
export function valuesOf(resp: QuestionResponse | null | undefined): Record<string, string> {
  if (resp && resp.type === "FILL_BLANK") return resp.values;
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
