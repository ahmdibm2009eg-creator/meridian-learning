"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip, CorrectChip, IncorrectChip, Markdown } from "@/components/lms/bits";
import { QuestionRenderer, type RenderQuestion } from "@/components/lms/QuestionRenderer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { QuestionResponse } from "@/lib/types";
import { textOf } from "@/lib/types";
import { Dumbbell, Filter, Zap, Clock, ListChecks, CheckCircle2 } from "lucide-react";

interface TaxonomyNode { id: string; name: string; level: string; parentId: string | null; questionCount: number }

interface Feedback {
  result: { correct: boolean | null; awarded: number; max: number; detail: { part: string; ok: boolean; got: string; expected: string }[]; slow: boolean; secondsSpent: number; targetSeconds: number; answered: boolean };
  mistake: { category: string } | null;
  answerKey: unknown;
  explanation: string;
  strategies: Record<string, string>;
  misconceptions: string[];
}

export function PracticeView({ presetSkill, presetMistakes }: { presetSkill: string | null; presetMistakes: boolean }) {
  const { t } = useApp();
  const [nodes, setNodes] = useState<TaxonomyNode[] | null>(null);
  const [filters, setFilters] = useState<{ type: string; difficulty: string; taxonomyNodeId: string; adaptive: boolean; mistakesOnly: boolean }>({
    type: "all", difficulty: "all", taxonomyNodeId: presetSkill ?? "all", adaptive: true, mistakesOnly: presetMistakes,
  });
  const [session, setSession] = useState<null | { questions: (RenderQuestion & { taxonomyName: string | null })[]; passages: { id: string; title: string; text: string; source: string }[]; mistakeRetry: boolean }>(null);
  const [idx, setIdx] = useState(0);
  const [response, setResponse] = useState<QuestionResponse | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [selfAssessment, setSelfAssessment] = useState<"CONFIDENT" | "UNCERTAIN" | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [usedAiHelp, setUsedAiHelp] = useState(false);
  const [error, setError] = useState("");
  const questionStart = useRef<Date>(new Date());

  useEffect(() => {
    get<{ nodes: TaxonomyNode[] }>("/api/taxonomy").then((d) => setNodes(d.nodes)).catch((e) => setError(e.message));
  }, []);

  const skillNodes = useMemo(() => (nodes ?? []).filter((n) => n.level === "SKILL" || n.level === "SUBSKILL"), [nodes]);

  async function startSession() {
    setError("");
    setSession(null);
    setFeedback(null);
    setIdx(0);
    setStats({ correct: 0, total: 0 });
    try {
      const data = await post<{ questions: (RenderQuestion & { taxonomyName: string | null })[]; passages: never[]; mistakeRetry: boolean }>("/api/practice/set", {
        type: filters.type === "all" ? undefined : filters.type,
        difficulty: filters.difficulty === "all" ? undefined : Number(filters.difficulty),
        taxonomyNodeId: filters.taxonomyNodeId === "all" ? undefined : filters.taxonomyNodeId,
        adaptive: filters.adaptive,
        mistakesOnly: filters.mistakesOnly || undefined,
        onlyDue: filters.mistakesOnly || undefined,
        limit: 8,
      });
      setSession(data);
      setResponse(null);
      questionStart.current = new Date();
      if (data.questions.length === 0 && !data.mistakeRetry) {
        toast({ title: t("practice.noQuestions") });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function check() {
    if (!session || feedback) return;
    const q = session.questions[idx];
    setChecking(true);
    try {
      const data = await post<Feedback>("/api/practice/answer", {
        questionId: q.id,
        response,
        secondsSpent: Math.round((Date.now() - questionStart.current.getTime()) / 1000),
        usedAiHelp,
        selfAssessment,
      });
      setFeedback(data);
      setStats((s) => ({ correct: s.correct + (data.result.correct ? 1 : 0), total: s.total + (data.result.correct === null ? 0 : 1) }));
      if (data.mistake) {
        toast({ title: `${t("mistakes.title")}: ${data.mistake.category}` });
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (!session) return;
    setFeedback(null);
    setResponse(null);
    setSelfAssessment(null);
    setUsedAiHelp(false);
    questionStart.current = new Date();
    setIdx(idx + 1);
  }

  if (error && !session) return <ErrorNotice message={error} onRetry={() => setError("")} />;

  // ── Setup screen ───────────────────────────────────────────
  if (!session) {
    return (
      <div>
        <PageHeader title={t("practice.title")} subtitle={t("practice.subtitle")} />
        <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6" aria-label={t("practice.filters")}>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Filter className="size-5" aria-hidden />{t("practice.filters")}</h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="f-type" className="text-base">{t("practice.type")}</Label>
                <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
                  <SelectTrigger id="f-type" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "NUMERIC", "MATCHING", "ORDERING", "FILL_BLANK", "ESSAY"].map((ty) => (
                      <SelectItem key={ty} value={ty}>{ty.replace(/_/g, " ").toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-diff" className="text-base">{t("practice.difficulty")}</Label>
                <Select value={filters.difficulty} onValueChange={(v) => setFilters({ ...filters, difficulty: v })}>
                  <SelectTrigger id="f-diff" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {[1, 2, 3, 4, 5].map((d) => <SelectItem key={d} value={String(d)}>{"●".repeat(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-skill" className="text-base">{t("practice.skill")}</Label>
                <Select value={filters.taxonomyNodeId} onValueChange={(v) => setFilters({ ...filters, taxonomyNodeId: v })}>
                  <SelectTrigger id="f-skill" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    {skillNodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name} ({n.questionCount})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
              <div>
                <Label htmlFor="f-adaptive" className="text-base font-medium">Adaptive ordering</Label>
                <p className="text-xs text-muted-foreground">Weakest skills first, based on your mastery estimates.</p>
              </div>
              <Switch id="f-adaptive" checked={filters.adaptive} onCheckedChange={(v) => setFilters({ ...filters, adaptive: v })} />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
              <div>
                <Label htmlFor="f-mistakes" className="text-base font-medium">{t("practice.retryMistakes")}</Label>
                <p className="text-xs text-muted-foreground">{t("mistakes.subtitle")}</p>
              </div>
              <Switch id="f-mistakes" checked={filters.mistakesOnly} onCheckedChange={(v) => setFilters({ ...filters, mistakesOnly: v })} />
            </div>

            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

            <Button size="lg" className="w-full text-lg" onClick={startSession} disabled={!nodes}>
              <Dumbbell className="me-2 size-5" aria-hidden />
              {t("practice.start")}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  // ── Session finished ───────────────────────────────────────
  if (idx >= session.questions.length) {
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">{t("practice.finished")}</h1>
          {stats.total > 0 && (
            <>
              <p className="mt-2 text-4xl font-bold tabular-nums">{pct}%</p>
              <p className="mt-1 text-muted-foreground">{stats.correct}/{stats.total} {t("practice.correct")}</p>
            </>
          )}
          <p className="mt-3 text-sm text-muted-foreground">{t("mistakes.subtitle")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={startSession}><Dumbbell className="me-2 size-5" aria-hidden />{t("practice.start")}</Button>
            <Button size="lg" variant="outline" onClick={() => navigate("mistakes")}><ListChecks className="me-2 size-5" aria-hidden />{t("mistakes.title")}</Button>
            <Button size="lg" variant="outline" onClick={() => setSession(null)}>{t("practice.filters")}</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active question ────────────────────────────────────────
  const q = session.questions[idx];
  const passage = q.passageId ? session.passages.find((p) => p.id === q.passageId) : null;
  const isEssay = q.type === "ESSAY";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Chip tone="primary">{idx + 1} / {session.questions.length}</Chip>
          {session.mistakeRetry && <Chip tone="warning" icon={<ListChecks className="size-3.5" aria-hidden />}>{t("mistakes.title")}</Chip>}
          {stats.total > 0 && <Chip tone="muted">{stats.correct}/{stats.total} ✓</Chip>}
        </div>
        <Button variant="outline" size="lg" onClick={() => setSession(null)}>{t("common.close")}</Button>
      </div>

      <div className={passage ? "grid gap-6 xl:grid-cols-2" : ""}>
        {passage && (
          <section aria-label={t("reader.passage")} className="reading-measure rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-2 text-lg font-bold">{passage.title}</h2>
            <Markdown text={passage.text} />
            {passage.source && <p className="mt-3 text-xs text-muted-foreground">{passage.source}</p>}
          </section>
        )}
        <div>
          <QuestionRenderer
            q={{ ...q, answerKey: feedback?.answerKey, explanation: feedback?.explanation, strategies: feedback?.strategies, misconceptions: feedback?.misconceptions }}
            mode="practice"
            value={response}
            onChange={(v) => !feedback && setResponse(v)}
            feedback={feedback?.result ? { ...feedback.result, secondsSpent: feedback.result.secondsSpent, targetSeconds: feedback.result.targetSeconds } : null}
            index={idx}
            onAskTutor={() => navigate("tutor")}
          />

          {/* Essay self-assessment */}
          {isEssay && response && "text" in response && response.text.trim() && !feedback && (
            <fieldset className="mt-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
              <legend className="px-2 font-semibold">{t("practice.selfAssess")}</legend>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="lg" aria-pressed={selfAssessment === "CONFIDENT"} onClick={() => setSelfAssessment("CONFIDENT")}>
                  <Zap className="me-2 size-4" aria-hidden />{t("practice.confident")}
                </Button>
                <Button variant="outline" size="lg" aria-pressed={selfAssessment === "UNCERTAIN"} onClick={() => setSelfAssessment("UNCERTAIN")}>
                  <Clock className="me-2 size-4" aria-hidden />{t("practice.uncertain")}
                </Button>
              </div>
            </fieldset>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={usedAiHelp}
                disabled={!!feedback}
                onChange={(e) => setUsedAiHelp(e.target.checked)}
              />
              {t("practice.askedAi")}
            </label>
            {!feedback ? (
              <Button size="lg" className="min-w-40 text-lg" onClick={check} disabled={checking || (!response && !isEssay) || (isEssay && (!response || !("text" in response && response.text.trim())))}>
                {checking ? t("common.loading") : t("practice.check")}
              </Button>
            ) : (
              <Button size="lg" className="min-w-40 text-lg" onClick={next}>{t("practice.nextQuestion")} →</Button>
            )}
          </div>

          {feedback?.result.slow && feedback.result.correct && (
            <p className="mt-3 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-sm text-[var(--warning)]" role="status">
              <Clock className="me-1 inline size-4" aria-hidden />
              {feedback.result.secondsSpent}s vs target {feedback.result.targetSeconds}s — {t("mistakes.correctSlow").toLowerCase()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
