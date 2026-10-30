"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import type { QuestionResponse } from "@/lib/types";
import { selectedIds, selectedBool, valuesOf } from "@/lib/types";
import { Markdown, Chip, CorrectChip, IncorrectChip, PartialChip } from "@/components/lms/bits";
import { X, Flag, Volume2, Lightbulb, BookOpen, AlertTriangle, Clock } from "lucide-react";

export interface RenderQuestion {
  id: string;
  type: string;
  stem: string;
  content: any;
  difficulty: number;
  estimatedSeconds: number;
  points: number;
  taxonomyName?: string | null;
  passageId?: string | null;
  // Present only when feedback is allowed:
  answerKey?: any;
  explanation?: string;
  strategies?: Record<string, string>;
  misconceptions?: string[];
}

interface Props {
  q: RenderQuestion;
  mode: "exam" | "practice" | "review";
  value: QuestionResponse | null;
  onChange?: (v: QuestionResponse | null) => void;
  flagged?: boolean;
  onFlag?: (f: boolean) => void;
  eliminated?: string[];
  onEliminate?: (ids: string[]) => void;
  // practice feedback (returned by the grading API):
  feedback?: {
    correct: boolean | null;
    awarded: number;
    max: number;
    detail: { part: string; ok: boolean; got: string; expected: string }[];
    slow?: boolean;
    secondsSpent?: number;
    targetSeconds?: number;
    answered?: boolean;
  } | null;
  onAskTutor?: () => void;
  usedAiHelp?: boolean;
  index?: number;
  selfAssessment?: "CONFIDENT" | "UNCERTAIN" | null;
  onSelfAssess?: (v: "CONFIDENT" | "UNCERTAIN") => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function QuestionRenderer(props: Props) {
  const { q, mode, value, onChange, flagged, onFlag, eliminated = [], onEliminate, feedback, index } = props;
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [speaking, setSpeaking] = useState(false);

  const interactive = mode !== "review" && !!onChange;

  function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const opts = q.content?.options?.map((o: { text: string }) => o.text).join(". ") ?? "";
    const text = `${q.stem} ${opts}`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale === "ar" ? "ar-SA" : "en-US";
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  const header = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {index !== undefined && (
        <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary tabular-nums">
          {t("practice.question", { n: index + 1 })}
        </span>
      )}
      <Chip tone="muted">{t("qbank.type")}: {typeLabel(q.type)}</Chip>
      <Chip tone="muted" aria-label={`${t("practice.difficulty")} ${q.difficulty} of 5`}>
        <span aria-hidden>{difficultyLabel(q.difficulty)}</span>
      </Chip>
      {q.taxonomyName && <Chip tone="primary">{q.taxonomyName}</Chip>}
      <span className="ms-auto flex items-center gap-1">
        <button
          type="button"
          onClick={speak}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          aria-label={t("lesson.listen")}
        >
          <Volume2 className="size-4" aria-hidden />
          {speaking ? t("lesson.stopListen") : t("lesson.listen")}
        </button>
        {onFlag && (
          <button
            type="button"
            onClick={() => onFlag(!flagged)}
            aria-pressed={!!flagged}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
              flagged ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"
            )}
          >
            <Flag className="size-4" aria-hidden />
            {flagged ? t("assess.unflag") : t("assess.flag")}
          </button>
        )}
      </span>
    </div>
  );

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-label={typeLabel(q.type)}>
      {header}
      <QuestionBody q={q} mode={mode} value={value} onChange={onChange} interactive={interactive} eliminated={eliminated} onEliminate={onEliminate} />
      {mode === "practice" && feedback && (
        <FeedbackPanel q={q} feedback={feedback} onAskTutor={props.onAskTutor} />
      )}
      {mode === "review" && q.answerKey !== undefined && <ReviewPanel q={q} />}
    </article>
  );
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    MCQ_SINGLE: "Multiple choice", MCQ_MULTI: "Multiple response", TRUE_FALSE: "True / False",
    SHORT_ANSWER: "Short answer", NUMERIC: "Numeric entry", ESSAY: "Extended response",
    MATCHING: "Matching", ORDERING: "Ordering", FILL_BLANK: "Fill in the blanks",
  };
  return map[type] ?? type;
}
function difficultyLabel(d: number) {
  return "●".repeat(Math.max(1, Math.min(5, d))) + "○".repeat(5 - Math.max(1, Math.min(5, d)));
}

// ── Stem + type-specific interaction ─────────────────────────

function QuestionBody({ q, mode, value, onChange, interactive, eliminated, onEliminate }: {
  q: RenderQuestion; mode: Props["mode"]; value: QuestionResponse | null;
  onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
  eliminated: string[]; onEliminate?: (ids: string[]) => void;
}) {
  return (
    <div>
      <StemWithBlanks q={q} value={value} onChange={onChange} interactive={interactive} />
      {q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI" ? (
        <McqInput q={q} value={value} onChange={onChange} interactive={interactive} eliminated={eliminated} onEliminate={onEliminate} />
      ) : q.type === "TRUE_FALSE" ? (
        <TrueFalseInput value={value} onChange={onChange} interactive={interactive} />
      ) : q.type === "SHORT_ANSWER" ? (
        <ShortAnswerInput value={value} onChange={onChange} interactive={interactive} />
      ) : q.type === "NUMERIC" ? (
        <NumericInput q={q} value={value} onChange={onChange} interactive={interactive} />
      ) : q.type === "ESSAY" ? (
        <EssayInput value={value} onChange={onChange} interactive={interactive} />
      ) : q.type === "MATCHING" ? (
        <MatchingInput q={q} value={value} onChange={onChange} interactive={interactive} />
      ) : q.type === "ORDERING" ? (
        <OrderingInput q={q} value={value} onChange={onChange} interactive={interactive} />
      ) : null}
    </div>
  );
}

function StemWithBlanks({ q, value, onChange, interactive }: {
  q: RenderQuestion; value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  if (q.type !== "FILL_BLANK") return <Markdown text={q.stem} className="text-lg" />;
  const parts = q.stem.split(/(\{\{\d+\}\})/g);
  const values = valuesOf(value);
  return (
    <div className="prose-lms text-lg">
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(\d+)\}\}$/);
        if (!m) return <span key={i}>{part}</span>;
        const blankId = m[1];
        return (
          <input
            key={i}
            type="text"
            inputMode="text"
            autoComplete="off"
            aria-label={`${t0("qbank.blanks")} ${blankId}`}
            className="mx-1 inline-block w-28 rounded-lg border-2 border-primary/50 bg-primary/5 px-2 py-0.5 text-center font-semibold focus-visible:border-primary"
            style={{ width: `${Math.max(4, (values[blankId]?.length ?? 0) + 2)}ch` }}
            value={values[blankId] ?? ""}
            disabled={!interactive}
            onChange={(e) => {
              const next = { ...values, [blankId]: e.target.value };
              onChange?.({ type: "FILL_BLANK", values: next });
            }}
          />
        );
      })}
    </div>
  );
}
function t0(k: string) { return k; }

function McqInput({ q, value, onChange, interactive, eliminated, onEliminate }: {
  q: RenderQuestion; value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void;
  interactive: boolean; eliminated: string[]; onEliminate?: (ids: string[]) => void;
}) {
  const t = useApp((s) => s.t);
  const multi = q.type === "MCQ_MULTI";
  const options: { id: string; text: string }[] = q.content?.options ?? [];
  const selected = selectedIds(value);
  const role = multi ? "checkbox" : "radio";
  return (
    <fieldset className="mt-4">
      {multi && <legend className="mb-1 text-sm text-muted-foreground">{t("qbank.correctOptions")}</legend>}
      <div className="space-y-2.5" role={multi ? "group" : "radiogroup"} aria-label={multi ? t("qbank.correctOptions") : undefined}>
        {options.map((opt, i) => {
          const isSel = selected.includes(opt.id);
          const isElim = eliminated.includes(opt.id);
          return (
            <div key={opt.id} className={cn("option-row flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-left transition-colors", isElim && "eliminated")}>
              <button
                type="button"
                disabled={!interactive || isElim}
                aria-checked={isSel}
                role={role}
                onClick={() => {
                  if (multi) {
                    const next = isSel ? selected.filter((s) => s !== opt.id) : [...selected, opt.id];
                    onChange?.({ type: q.type as "MCQ_MULTI", selected: next });
                  } else {
                    onChange?.({ type: q.type as "MCQ_SINGLE", selected: [opt.id] });
                  }
                }}
                className="flex min-h-11 flex-1 items-center gap-3 text-start text-lg"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold",
                    isSel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted"
                  )}
                  aria-hidden
                >
                  {LETTERS[i]}
                </span>
                <span className="prose-lms flex-1 !my-0">{opt.text}</span>
              </button>
              {onEliminate && (
                <button
                  type="button"
                  onClick={() => {
                    const next = isElim ? eliminated.filter((e) => e !== opt.id) : [...eliminated, opt.id];
                    onEliminate(next);
                  }}
                  aria-pressed={isElim}
                  aria-label={`${t("assess.eliminate")} ${LETTERS[i]}`}
                  title={t("assess.eliminate")}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function TrueFalseInput({ value, onChange, interactive }: {
  value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  const t = useApp((s) => s.t);
  const sel = selectedBool(value);
  return (
    <div className="mt-4 flex flex-wrap gap-3" role="radiogroup" aria-label={t("qbank.type")}>
      {([true, false] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={sel === v}
          disabled={!interactive}
          onClick={() => onChange?.({ type: "TRUE_FALSE", selected: v })}
          className={cn(
            "option-row min-w-36 rounded-xl px-6 py-3 text-lg font-semibold",
            sel === v ? "border-primary bg-primary/10 text-primary" : "bg-card"
          )}
        >
          {v ? "True" : "False"}
        </button>
      ))}
    </div>
  );
}

function ShortAnswerInput({ value, onChange, interactive }: {
  value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  const t = useApp((s) => s.t);
  return (
    <div className="mt-4">
      <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="sa-input">{t("common.you")}</label>
      <input
        id="sa-input"
        type="text"
        autoComplete="off"
        className="w-full max-w-xl rounded-xl border-2 border-border bg-card px-4 py-3 text-lg focus-visible:border-primary"
        value={value && (value.type === "SHORT_ANSWER" || value.type === "ESSAY") ? value.text : ""}
        disabled={!interactive}
        onChange={(e) => onChange?.({ type: "SHORT_ANSWER", text: e.target.value })}
      />
    </div>
  );
}

function NumericInput({ q, value, onChange, interactive }: {
  q: RenderQuestion; value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  const t = useApp((s) => s.t);
  return (
    <div className="mt-4">
      <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="num-input">
        {q.content?.unit ? `${t("common.you")} (${q.content.unit})` : t("common.you")}
      </label>
      <input
        id="num-input"
        type="number"
        step="any"
        inputMode="decimal"
        autoComplete="off"
        className="w-full max-w-48 rounded-xl border-2 border-border bg-card px-4 py-3 text-lg tabular-nums focus-visible:border-primary"
        value={value && value.type === "NUMERIC" && value.value !== null ? value.value : ""}
        disabled={!interactive}
        onChange={(e) => onChange?.({ type: "NUMERIC", value: e.target.value === "" ? null : Number(e.target.value) })}
      />
    </div>
  );
}

function EssayInput({ value, onChange, interactive }: {
  value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  const t = useApp((s) => s.t);
  return (
    <div className="mt-4">
      <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="essay-input">{t("common.you")}</label>
      <textarea
        id="essay-input"
        rows={8}
        className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-lg focus-visible:border-primary"
        value={value && (value.type === "SHORT_ANSWER" || value.type === "ESSAY") ? value.text : ""}
        disabled={!interactive}
        onChange={(e) => onChange?.({ type: "ESSAY", text: e.target.value })}
      />
    </div>
  );
}

function MatchingInput({ q, value, onChange, interactive }: {
  q: RenderQuestion; value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  const t = useApp((s) => s.t);
  const pairs: { id: string; left: string; right: string }[] = q.content?.pairs ?? [];
  // Deterministic shuffle of the right column (seeded by question id)
  const rights = useMemo(() => {
    const arr = [...pairs.map((p) => p.right)];
    let s = 0;
    for (const c of q.id) s = (s * 31 + c.charCodeAt(0)) % 997;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 137 + 149) % 997;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [q.id, pairs]);
  const mapping = value && value.type === "MATCHING" ? value.mapping : {};
  return (
    <div className="mt-4 space-y-3">
      {q.content?.instruction && <p className="text-sm text-muted-foreground">{q.content.instruction}</p>}
      {pairs.map((p) => (
        <div key={p.id} className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <span className="font-medium">{p.left}</span>
          <span aria-hidden className="hidden text-muted-foreground sm:block">→</span>
          <label className="sr-only" htmlFor={`match-${p.id}`}>{`${t("qbank.rightSide")}: ${p.left}`}</label>
          <select
            id={`match-${p.id}`}
            disabled={!interactive}
            className="min-h-11 w-full rounded-lg border-2 border-border bg-card px-3 py-2 text-base focus-visible:border-primary"
            value={mapping[p.id] ?? ""}
            onChange={(e) => onChange?.({ type: "MATCHING", mapping: { ...mapping, [p.id]: e.target.value } })}
          >
            <option value="">—</option>
            {rights.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingInput({ q, value, onChange, interactive }: {
  q: RenderQuestion; value: QuestionResponse | null; onChange?: (v: QuestionResponse | null) => void; interactive: boolean;
}) {
  const t = useApp((s) => s.t);
  const items: { id: string; text: string }[] = q.content?.items ?? [];
  const [order, setOrder] = useState<string[]>(
    value && value.type === "ORDERING" && value.order?.length ? value.order : items.map((i) => i.id)
  );
  const current = value && value.type === "ORDERING" && value.order?.length ? value.order : order;
  const list = current.map((id) => items.find((i) => i.id === id)!).filter(Boolean);

  function move(idx: number, dir: -1 | 1) {
    const next = [...current];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
    onChange?.({ type: "ORDERING", order: next });
  }

  return (
    <div className="mt-4">
      {q.content?.instruction && <p className="mb-2 text-sm text-muted-foreground">{q.content.instruction}</p>}
      <ol className="space-y-2" aria-label={t("qbank.orderItems")}>
        {list.map((item, idx) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted text-sm font-bold tabular-nums" aria-hidden>
              {idx + 1}
            </span>
            <span className="flex-1 text-base sm:text-lg">{item.text}</span>
            {interactive && (
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`${t("common.previous")} — ${item.text}`}
                  className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === list.length - 1}
                  aria-label={`${t("common.next")} — ${item.text}`}
                  className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-40"
                >
                  ↓
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Practice feedback ────────────────────────────────────────

function FeedbackPanel({ q, feedback, onAskTutor }: {
  q: RenderQuestion;
  feedback: NonNullable<Props["feedback"]>;
  onAskTutor?: () => void;
}) {
  const t = useApp((s) => s.t);
  const hasPartial = feedback.detail.some((d) => !d.ok) && feedback.awarded > 0;
  return (
    <div className="mt-5 rounded-xl border-2 border-primary/30 bg-primary/5 p-4" role="region" aria-label={t("practice.explanation")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {feedback.correct === null ? (
          <Chip tone="primary">Self-assessed</Chip>
        ) : feedback.correct ? (
          <CorrectChip />
        ) : hasPartial ? (
          <PartialChip />
        ) : (
          <IncorrectChip />
        )}
        {feedback.slow && feedback.correct && (
          <Chip tone="warning" icon={<Clock className="size-3.5" aria-hidden />}>
            {feedback.secondsSpent}s / target {feedback.targetSeconds}s
          </Chip>
        )}
        {feedback.awarded > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {feedback.awarded} / {feedback.max} {t("common.points")}
          </span>
        )}
      </div>

      {feedback.detail.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {feedback.detail.map((d, i) => (
            <li key={i} className={d.ok ? "text-[var(--success)]" : "text-destructive"}>
              {d.ok ? "✓" : "✗"} {d.part}: {t("assess.yourAnswer")} “{d.got}” · {t("assess.correctAnswer")} “{d.expected}”
            </li>
          ))}
        </ul>
      )}

      {q.explanation && (
        <div>
          <h4 className="mb-1 font-semibold">{t("practice.explanation")}</h4>
          <Markdown text={q.explanation} />
        </div>
      )}

      {q.strategies && Object.values(q.strategies).some(Boolean) && (
        <details className="mt-3 rounded-lg border border-border bg-card p-3">
          <summary className="cursor-pointer font-semibold">{t("practice.strategies")}</summary>
          <dl className="mt-2 space-y-3">
            {(["fastest", "standard", "beginner", "alternative", "shortcut"] as const).map((k) =>
              q.strategies?.[k] ? (
                <div key={k}>
                  <dt className="text-sm font-semibold text-primary">
                    <Lightbulb className="me-1 inline size-4" aria-hidden />
                    {t(`practice.strategy${k[0].toUpperCase()}${k.slice(1)}`)}
                  </dt>
                  <dd className="text-base"><Markdown text={q.strategies[k]!} className="!my-1" /></dd>
                </div>
              ) : null
            )}
          </dl>
        </details>
      )}

      {q.misconceptions && q.misconceptions.length > 0 && (
        <details className="mt-2 rounded-lg border border-border bg-card p-3">
          <summary className="cursor-pointer font-semibold">{t("practice.misconceptions")}</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-base">
            {q.misconceptions.map((m, i) => <li key={i}><AlertTriangle className="me-1 inline size-4 text-[var(--warning)]" aria-hidden />{m}</li>)}
          </ul>
        </details>
      )}

      {onAskTutor && (
        <button
          type="button"
          onClick={onAskTutor}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border-2 border-primary px-4 py-2 font-semibold text-primary hover:bg-primary/10"
        >
          <BookOpen className="size-4" aria-hidden />
          {t("practice.askTutor")}
        </button>
      )}
    </div>
  );
}

// ── Review mode panel ────────────────────────────────────────

function ReviewPanel({ q }: { q: RenderQuestion }) {
  const t = useApp((s) => s.t);
  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/50 p-4">
      <h4 className="mb-1 font-semibold">{t("assess.correctAnswer")}</h4>
      <AnswerKeyText q={q} />
      {q.explanation && (
        <>
          <h5 className="mt-3 font-semibold">{t("practice.explanation")}</h5>
          <Markdown text={q.explanation} />
        </>
      )}
      {q.strategies && Object.values(q.strategies).some(Boolean) && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-primary">{t("practice.strategies")}</summary>
          <dl className="mt-2 space-y-2">
            {(["fastest", "standard", "beginner", "alternative", "shortcut"] as const).map((k) =>
              q.strategies?.[k] ? (
                <div key={k}>
                  <dt className="text-sm font-semibold">{t(`practice.strategy${k[0].toUpperCase()}${k.slice(1)}`)}</dt>
                  <dd className="text-base">{q.strategies[k]}</dd>
                </div>
              ) : null
            )}
          </dl>
        </details>
      )}
    </div>
  );
}

export function AnswerKeyText({ q }: { q: RenderQuestion }) {
  const key = q.answerKey ?? {};
  switch (q.type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI": {
      const options: { id: string; text: string }[] = q.content?.options ?? [];
      const correct = (key.correct ?? []) as string[];
      return (
        <p className="font-semibold">
          {options.filter((o) => correct.includes(o.id)).map((o) => o.text).join(" · ") || "—"}
        </p>
      );
    }
    case "TRUE_FALSE":
      return <p className="font-semibold">{String(key.correct)}</p>;
    case "SHORT_ANSWER":
      return <p className="font-semibold">{((key.accepted ?? []) as string[]).join(" / ")}</p>;
    case "NUMERIC":
      return <p className="font-semibold tabular-nums">{key.value} ± {key.tolerance}</p>;
    case "ORDERING": {
      const items: { id: string; text: string }[] = q.content?.items ?? [];
      const order = (key.correctOrder ?? []) as string[];
      return <p className="font-semibold">{order.map((id) => items.find((i) => i.id === id)?.text ?? id).join(" → ")}</p>;
    }
    case "FILL_BLANK": {
      const acc = (key.accepted ?? {}) as Record<string, string[]>;
      return (
        <p className="font-semibold">
          {Object.entries(acc).map(([id, list]) => `(${id}): ${list.join(" / ")}`).join("  ·  ")}
        </p>
      );
    }
    case "MATCHING": {
      const pairs: { id: string; left: string; right: string }[] = q.content?.pairs ?? [];
      return (
        <ul className="list-disc ps-5">
          {pairs.map((p) => <li key={p.id}><strong>{p.left}</strong> → {p.right}</li>)}
        </ul>
      );
    }
    case "ESSAY":
      return <p className="font-semibold">{q.content?.modelAnswer ?? "—"}</p>;
    default:
      return null;
  }
}
