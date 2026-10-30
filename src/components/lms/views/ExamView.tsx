"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, patch, post } from "@/lib/api-client";
import { Loader, ErrorNotice, Markdown, Chip } from "@/components/lms/bits";
import { QuestionRenderer, type RenderQuestion } from "@/components/lms/QuestionRenderer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { QuestionResponse } from "@/lib/types";
import { selectedIds, selectedBool, textOf, valueOf, mappingOf, orderOf, valuesOf } from "@/lib/types";
import { Clock, Save, Grid3x3, Calculator, NotebookPen, ChevronLeft, ChevronRight, CheckCircle2, XCircle, LogOut } from "lucide-react";

interface AttemptData {
  attempt: {
    id: string; status: string; startedAt: string; submittedAt: string | null;
    score: number | null; maxScore: number | null; timeSpentSec: number;
    remainingSec: number | null;
    assessment: { id: string; title: string; type: string; timeLimitMin: number | null; passScorePct: number; feedbackMode: string; course: { id: string; title: string } | null };
    questions: (RenderQuestion & {
      answer: {
        response: QuestionResponse | null;
        flagged: boolean;
        eliminated: string[];
        timeSpentSec: number;
        isCorrect?: boolean | null;
        pointsAwarded?: number;
      };
      answerKey?: unknown;
      explanation?: string;
      strategies?: Record<string, string>;
      misconceptions?: string[];
    })[];
    passages: { id: string; title: string; text: string; source: string }[];
  };
}

export function ExamView({ attemptId, onExit }: { attemptId: string; onExit: () => void }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const [data, setData] = useState<AttemptData | null>(null);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, QuestionResponse | null>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [eliminated, setEliminated] = useState<Record<string, string[]>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { score: number; maxScore: number; pct: number; passed: boolean; correctCount: number; answeredCount: number; totalQuestions: number; timeSpentSec: number }>(null);
  const [showNavigator, setShowNavigator] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [scratchpad, setScratchpad] = useState("");
  const [showFormulas, setShowFormulas] = useState(false);
  const dirty = useRef(false);
  const questionStart = useRef(Date.now());
  const timers = useRef<Record<string, number>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    get<AttemptData>(`/api/attempts/${attemptId}`).then((d) => {
      setData(d);
      const r: Record<string, QuestionResponse | null> = {};
      const f: Record<string, boolean> = {};
      const e: Record<string, string[]> = {};
      const tm: Record<string, number> = {};
      for (const q of d.attempt.questions) {
        r[q.id] = q.answer.response ?? null;
        f[q.id] = q.answer.flagged;
        e[q.id] = q.answer.eliminated ?? [];
        tm[q.id] = q.answer.timeSpentSec ?? 0;
      }
      setResponses(r); setFlags(f); setEliminated(e); timers.current = tm;
      setRemaining(d.attempt.remainingSec);
      hydrated.current = true;
    }).catch((e) => setError(e.message));
  }, [attemptId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { questionStart.current = Date.now(); }, [idx]);

  const submitted = data?.attempt.status === "SUBMITTED" || data?.attempt.status === "GRADED" || !!result;

  // Timer countdown → auto-submit
  useEffect(() => {
    if (submitted || remaining === null || remaining <= 0) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r === null) return r;
        if (r <= 1) {
          clearInterval(timer);
          toast({ title: t("assess.timeExpired") });
          doSubmit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [submitted, remaining === null]);

  const hydrated = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  // Autosave
  const save = useCallback(async (silent = false) => {
    if (!data || submitted) return;
    const answers = data.attempt.questions.map((q) => ({
      questionId: q.id,
      response: responses[q.id] ?? null,
      flagged: !!flags[q.id],
      eliminated: eliminated[q.id] ?? [],
      timeSpentSec: (timers.current[q.id] ?? 0) + Math.round((Date.now() - questionStart.current) / 1000),
    }));
    setSaveState("saving");
    try {
      await patch(`/api/attempts/${attemptId}`, { answers });
      setSaveState("saved");
      for (const q of data.attempt.questions) {
        timers.current[q.id] = (timers.current[q.id] ?? 0) + Math.round((Date.now() - questionStart.current) / 1000);
      }
      questionStart.current = Date.now();
      if (!silent) setTimeout(() => setSaveState("idle"), 2000);
      dirty.current = false;
    } catch (e) {
      setSaveState("idle");
      if (!silent) toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }, [data, responses, flags, eliminated, attemptId, submitted, t]);

  // Debounced autosave: reacts to answer/flag/elimination changes (always fresh state)
  useEffect(() => {
    saveRef.current = () => save();
  }, [save]);

  useEffect(() => {
    if (!hydrated.current || submitted) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(), 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [responses, flags, eliminated, submitted]);

  // Mark hydrated after the initial load populates state
  useEffect(() => {
    if (data && !hydrated.current) {
      const populated = data.attempt.questions.every((q) => q.id in responses);
      if (populated) hydrated.current = true;
    }
  }, [data, responses]);

  // Save on unmount / before unload
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", before);
    return () => { window.removeEventListener("beforeunload", before); if (dirty.current && !submitted) save(true); };
  }, [save, submitted]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!data) return <Loader />;

  const a = data.attempt;
  const qs = a.questions;
  const current = qs[idx];
  const passage = current?.passageId ? a.passages.find((p) => p.id === current.passageId) : null;
  const answeredCount = qs.filter((q) => responses[q.id] && isAnswered(q.type, responses[q.id])).length;
  const localeTag = locale === "ar" ? "ar" : "en";

  function isAnswered(type: string, resp: QuestionResponse | null): boolean {
    if (!resp) return false;
    switch (type) {
      case "MCQ_SINGLE": case "MCQ_MULTI": return selectedIds(resp).length > 0;
      case "TRUE_FALSE": return selectedBool(resp) !== null;
      case "SHORT_ANSWER": case "ESSAY": return textOf(resp).trim() !== "";
      case "NUMERIC": return valueOf(resp) !== null;
      case "MATCHING": return Object.values(mappingOf(resp)).some(Boolean);
      case "ORDERING": return orderOf(resp).length > 0;
      case "FILL_BLANK": return Object.values(valuesOf(resp)).some((v) => v.trim() !== "");
      default: return false;
    }
  }

  function update(id: string, v: QuestionResponse | null) {
    dirty.current = true;
    setResponses((r) => ({ ...r, [id]: v }));
  }
  function updateFlag(id: string, f: boolean) {
    dirty.current = true;
    setFlags((fl) => ({ ...fl, [id]: f }));
  }
  function updateElim(id: string, ids: string[]) {
    dirty.current = true;
    setEliminated((e) => ({ ...e, [id]: ids }));
  }

  async function doSubmit(auto = false) {
    if (submitting || submitted) return;
    if (!auto) setConfirmOpen(false);
    setSubmitting(true);
    try {
      await save(true);
      const res = await post<{ ok: boolean; score: number; maxScore: number; pct: number; passed: boolean; correctCount: number; answeredCount: number; totalQuestions: number; timeSpentSec: number }>(`/api/attempts/${attemptId}/submit`);
      setResult(res);
      setRemaining(0);
      load(); // reload with keys for review
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── RESULTS ────────────────────────────────────────────────
  if (result && data) {
    const withFeedback = a.assessment.feedbackMode === "AFTER_SUBMIT" || a.assessment.feedbackMode === "AFTER_CLOSE";
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 rounded-2xl border-2 p-6 text-center" style={{ borderColor: result.passed ? "var(--success)" : "var(--warning)", background: result.passed ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("assess.resultsTitle")}</p>
          <p className="mt-2 text-5xl font-bold tabular-nums">{result.pct}<span className="text-2xl">%</span></p>
          <p className="mt-1 text-lg font-semibold" style={{ color: result.passed ? "var(--success)" : "var(--warning)" }}>
            {result.passed ? `✓ ${t("assess.passed")}` : `✗ ${t("assess.failed")}`} · {t("assess.passScore", { pct: a.assessment.passScorePct })}
          </p>
          <p className="mt-2 text-muted-foreground tabular-nums">
            {result.score}/{result.maxScore} {t("common.points")} · {result.correctCount}/{result.totalQuestions} · {Math.round(result.timeSpentSec / 60)} min
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={onExit}>{t("assess.exitExam")}</Button>
            <Button size="lg" variant="outline" onClick={() => navigate("mistakes")}>{t("mistakes.title")}</Button>
          </div>
        </div>

        {withFeedback && (
          <section aria-label={t("assess.reviewAnswers")}>
            <h2 className="mb-4 text-xl font-bold">{t("assess.reviewAnswers")}</h2>
            <div className="space-y-5">
              {a.questions.map((q, i) => (
                <QuestionRenderer
                  key={q.id}
                  q={{ ...q, answerKey: q.answerKey as never, explanation: q.explanation, strategies: q.strategies, misconceptions: q.misconceptions }}
                  mode="review"
                  value={responses[q.id] ?? q.answer.response}
                  index={i}
                  feedback={{
                    correct: q.answer.isCorrect ?? null,
                    awarded: q.answer.pointsAwarded ?? 0,
                    max: q.points,
                    detail: [],
                  }}
                />
              ))}
            </div>
          </section>
        )}
        {!withFeedback && <p className="text-muted-foreground">{t("assess.noFeedback")}</p>}
      </div>
    );
  }

  // ── EXAM IN PROGRESS ───────────────────────────────────────
  const mm = remaining !== null ? String(Math.floor(remaining / 60)).padStart(2, "0") : null;
  const ss = remaining !== null ? String(remaining % 60).padStart(2, "0") : null;
  const timeCritical = remaining !== null && remaining < 300;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Exam header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{a.assessment.title}</p>
          <p className="text-xs text-muted-foreground">
            {answeredCount}/{qs.length} {t("assess.answered")} · {t("assess.autosave")}
            {saveState === "saving" && <span className="ms-2 text-primary">…</span>}
            {saveState === "saved" && <span className="ms-2 text-[var(--success)]">✓ {t("assess.autosaved")}</span>}
          </p>
        </div>
        {remaining !== null && (
          <div
            className={cn("flex items-center gap-2 rounded-xl border-2 px-4 py-2 font-bold tabular-nums", timeCritical ? "border-destructive bg-destructive/10 text-destructive" : "border-border")}
            role="timer"
            aria-label={t("assess.timeRemaining")}
            aria-live="off"
          >
            <Clock className="size-5" aria-hidden />
            <span className="text-xl">{mm}:{ss}</span>
          </div>
        )}
        <div className="flex gap-1">
          <Button variant="outline" size="lg" onClick={() => setShowNavigator(!showNavigator)} aria-expanded={showNavigator}>
            <Grid3x3 className="size-5" aria-hidden />
            <span className="ms-1 hidden sm:inline">{t("assess.questionNavigator")}</span>
          </Button>
          <Button variant="outline" size="lg" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}>
            <Calculator className="size-5" aria-hidden />
            <span className="ms-1 hidden sm:inline">{t("assess.calculator")}</span>
          </Button>
          <Button variant="outline" size="lg" onClick={() => setShowFormulas(true)}>
            <span className="text-xs font-bold">ƒx</span>
            <span className="ms-1 hidden sm:inline">{t("assess.formulaSheet")}</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Navigator */}
        {showNavigator && (
          <nav aria-label={t("assess.questionNavigator")} className="w-56 shrink-0 overflow-y-auto border-e border-border bg-card p-3">
            <div className="mb-2 grid grid-cols-5 gap-1.5">
              {qs.map((q, i) => {
                const answered = isAnswered(q.type, responses[q.id]);
                return (
                  <button
                    key={q.id}
                    onClick={() => setIdx(i)}
                    className={cn("nav-cell rounded-lg border-2 text-sm font-bold tabular-nums", answered ? "answered" : "border-border bg-card", i === idx && "current", flags[q.id] && "border-primary bg-primary/10")}
                    aria-label={`${t("practice.question", { n: i + 1 })} — ${answered ? t("assess.answered") : t("assess.unanswered")}${flags[q.id] ? `, ${t("assess.flagged")}` : ""}`}
                    aria-current={i === idx ? "true" : undefined}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li><span className="badge-dot me-1 inline-block bg-primary" aria-hidden />{t("assess.answered")}</li>
              <li><span className="badge-dot me-1 inline-block bg-primary/30" aria-hidden />{t("assess.flagged")}</li>
              <li><span className="badge-dot me-1 inline-block border border-border" aria-hidden />{t("assess.unanswered")}</li>
            </ul>
          </nav>
        )}

        {/* Question + passage */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[1fr_auto_1.1fr]">
            {passage ? (
              <section aria-label={t("reader.passage")} className="reading-measure rounded-2xl border border-border bg-card p-5">
                <h2 className="mb-2 text-lg font-bold">{passage.title}</h2>
                <Markdown text={passage.text} />
                {passage.source && <p className="mt-3 text-xs text-muted-foreground">{passage.source}</p>}
              </section>
            ) : null}
            <span className="hidden" aria-hidden />
            <section className="min-w-0" aria-label={t("practice.question", { n: idx + 1 })}>
              <QuestionRenderer
                q={current}
                mode="exam"
                value={responses[current.id] ?? null}
                onChange={(v) => update(current.id, v)}
                flagged={!!flags[current.id]}
                onFlag={(f) => updateFlag(current.id, f)}
                eliminated={eliminated[current.id] ?? []}
                onEliminate={(ids) => updateElim(current.id, ids)}
                index={idx}
              />
            </section>
          </div>
        </div>

        {/* Right rail: scratchpad */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-s border-border bg-card p-3 xl:block" aria-label={t("assess.scratchpad")}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <NotebookPen className="size-4" aria-hidden /> {t("assess.scratchpad")}
          </h2>
          <Textarea value={scratchpad} onChange={(e) => setScratchpad(e.target.value)} rows={16} className="text-sm" placeholder="…" aria-label={t("assess.scratchpad")} />
        </aside>
      </div>

      {/* Footer navigation */}
      <footer className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2 sm:px-5">
        <Button variant="outline" size="lg" disabled={idx === 0} onClick={() => { save(true); setIdx(idx - 1); }}>
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          <span className="ms-1 hidden sm:inline">{t("common.previous")}</span>
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {t("practice.question", { n: idx + 1 })} {t("common.of")} {qs.length}
        </span>
        {idx < qs.length - 1 ? (
          <Button size="lg" onClick={() => { save(true); setIdx(idx + 1); }}>
            <span className="me-1 hidden sm:inline">{t("common.next")}</span>
            <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
          </Button>
        ) : (
          <Button size="lg" onClick={() => setConfirmOpen(true)}>{t("assess.submitExam")}</Button>
        )}
      </footer>

      {/* Submit confirmation with review summary */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("assess.reviewBeforeSubmit")}</DialogTitle>
            <DialogDescription>{t("assess.cannotChange")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border p-3">
                <p className="text-2xl font-bold tabular-nums">{answeredCount}</p>
                <p className="text-xs text-muted-foreground">{t("assess.answered")}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-2xl font-bold tabular-nums">{qs.length - answeredCount}</p>
                <p className="text-xs text-muted-foreground">{t("assess.unanswered")}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-2xl font-bold tabular-nums">{Object.values(flags).filter(Boolean).length}</p>
                <p className="text-xs text-muted-foreground">{t("assess.flagged")}</p>
              </div>
            </div>
            {qs.length - answeredCount > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-border p-2 text-sm">
                {qs.map((q, i) => !isAnswered(q.type, responses[q.id]) && (
                  <li key={q.id}>
                    <button className="w-full rounded p-1.5 text-start hover:bg-muted" onClick={() => { setConfirmOpen(false); setIdx(i); }}>
                      {t("practice.question", { n: i + 1 })} — {q.stem.slice(0, 60)}…
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t("common.back")}</Button>
            <Button onClick={() => doSubmit()} disabled={submitting}>
              <Save className="me-2 size-4" aria-hidden />
              {t("assess.submitExam")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calculator dialog */}
      {showCalc && <CalculatorDialog onClose={() => setShowCalc(false)} />}

      {/* Formula sheet */}
      <Dialog open={showFormulas} onOpenChange={setShowFormulas}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("assess.formulaSheet")}</DialogTitle></DialogHeader>
          <ul className="prose-lms space-y-2 text-base">
            <li><span className="mathspan">A = πr²</span> — area of a circle</li>
            <li><span className="mathspan">C = 2πr</span> — circumference</li>
            <li><span className="mathspan">a² + b² = c²</span> — Pythagorean theorem</li>
            <li><span className="mathspan">x = (−b ± √(b² − 4ac)) / 2a</span> — quadratic formula</li>
            <li><span className="mathspan">y − y₁ = m(x − x₁)</span> — point-slope form</li>
            <li><span className="mathspan">sin²θ + cos²θ = 1</span> — Pythagorean identity</li>
            <li><span className="mathspan">% change = (new − old) / old × 100</span></li>
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalculatorDialog({ onClose }: { onClose: () => void }) {
  const t = useApp((s) => s.t);
  const [expr, setExpr] = useState("");
  const [out, setOut] = useState("");

  function press(k: string) { setExpr((e) => e + k); }
  function clear() { setExpr(""); setOut(""); }

  function evaluate() {
    // Safe arithmetic evaluation: only digits and + - * / . ( ) %
    if (!/^[\d+\-*/.() %]+$/.test(expr)) { setOut("—"); return; }
    try {
      const v = Function(`"use strict"; return (${expr.replace(/%/g, "/100")})`)();
      setOut(Number.isFinite(v) ? String(Math.round(v * 1e8) / 1e8) : "—");
    } catch {
      setOut("—");
    }
  }

  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "%", "+", "(", ")", "="];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>{t("assess.calculator")}</DialogTitle></DialogHeader>
        <div>
          <label htmlFor="calc-expr" className="sr-only">{t("assess.calculator")}</label>
          <input
            id="calc-expr"
            className="mb-2 w-full rounded-xl border-2 border-border bg-card px-3 py-2 text-end text-2xl tabular-nums"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && evaluate()}
            aria-describedby="calc-out"
          />
          <p id="calc-out" className="mb-3 min-h-10 rounded-xl bg-muted p-2 text-end text-2xl font-bold tabular-nums" aria-live="polite">{out || " "}</p>
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={clear} className="col-span-2 min-h-11 rounded-lg border-2 border-[var(--warning)]/50 font-semibold">C</button>
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => (k === "=" ? evaluate() : press(k))}
                className="min-h-11 rounded-lg border-2 border-border bg-card text-lg font-semibold hover:bg-muted"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
