"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, patch, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip, DueChip, StatCard } from "@/components/lms/bits";
import { QuestionRenderer, AnswerKeyText } from "@/components/lms/QuestionRenderer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { QuestionResponse } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListChecks, CheckCircle2, RefreshCw, GraduationCap } from "lucide-react";

interface MistakeRow {
  id: string; category: string; errorType: string; rootCause: string;
  status: string; retryDueAt: string | null; reviewCount: number;
  lastReviewedAt: string | null; createdAt: string; due: boolean;
  taxonomy: { id: string; name: string } | null;
  question: { id: string; type: string; stem: string; difficulty: number; taxonomyNodeId: string | null; passageId: string | null };
}

export function MistakesView() {
  const { t } = useApp();
  const [entries, setEntries] = useState<MistakeRow[] | null>(null);
  const [counts, setCounts] = useState<{ due: number; open: number; mastered: number } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("active");
  const [retry, setRetry] = useState<null | { row: MistakeRow; feedback: null | { correct: boolean | null; awarded: number; detail: unknown[] } }>(null);
  const [response, setResponse] = useState<QuestionResponse | null>(null);

  const load = useCallback(() => {
    get<{ entries: MistakeRow[]; counts: { due: number; open: number; mastered: number } }>("/api/mistakes")
      .then((d) => { setEntries(d.entries); setCounts(d.counts); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!entries || !counts) return <Loader />;

  const active = entries.filter((e) => e.status !== "MASTERED");
  const mastered = entries.filter((e) => e.status === "MASTERED");
  const shown = tab === "mastered" ? mastered : active;

  async function update(id: string, body: Record<string, unknown>) {
    try {
      await patch(`/api/mistakes/${id}`, body);
      load();
      toast({ title: t("common.saved") });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  async function checkRetry(row: MistakeRow) {
    try {
      const data = await post<{ result: { correct: boolean | null; awarded: number; max: number; detail: unknown[] }; mistake: unknown }>("/api/practice/answer", {
        questionId: row.question.id,
        response,
        secondsSpent: 60,
      });
      setRetry({ row, feedback: data.result });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  const errorTypeOptions = ["UNCATEGORIZED", "CONCEPTUAL", "PROCEDURAL", "CARELESS", "MISREAD", "TIME"];
  const errorTypeKey = (et: string) => `mistakes.${et.toLowerCase()}`;

  return (
    <div>
      <PageHeader
        title={t("mistakes.title")}
        subtitle={t("mistakes.subtitle")}
        actions={
          <Button size="lg" onClick={() => navigate("practice", "mistakes")}>
            <RefreshCw className="me-2 size-5" aria-hidden />
            {counts.due > 0 ? t("practice.mistakesDue", { n: counts.due }) : t("practice.retryMistakes")}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label={t("mistakes.due")} value={counts.due} icon={<ListChecks className="size-5" aria-hidden />} />
        <StatCard label={t("mistakes.scheduled")} value={counts.open - counts.due} />
        <StatCard label={t("mistakes.mastered")} value={counts.mastered} icon={<CheckCircle2 className="size-5" aria-hidden />} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="active" className="text-base">{t("mistakes.scheduled")} ({active.length})</TabsTrigger>
          <TabsTrigger value="mastered" className="text-base">{t("mistakes.mastered")} ({mastered.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {shown.length === 0 ? (
            <EmptyState title={t("mistakes.empty")} icon={<GraduationCap className="size-8 text-primary" aria-hidden />}
              action={<Button onClick={() => navigate("practice")}>{t("practice.start")}</Button>} />
          ) : (
            <ul className="space-y-3">
              {shown.map((e) => (
                <li key={e.id}>
                  <article className="rounded-2xl border border-border bg-card p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Chip tone={e.category === "MASTERED_AFTER_REVIEW" ? "success" : e.category === "INDEPENDENTLY_INCORRECT" ? "danger" : "warning"}>
                        {categoryText(e.category, t)}
                      </Chip>
                      <DueChip date={e.retryDueAt} />
                      {e.taxonomy && <Chip tone="muted">{e.taxonomy.name}</Chip>}
                      <Chip tone="muted">{t(errorTypeKey(e.errorType))}</Chip>
                    </div>

                    <p className="mb-3 font-medium">{e.question.stem.length > 220 ? e.question.stem.slice(0, 220) + "…" : e.question.stem}</p>

                    {/* Retry inline */}
                    {retry?.row.id === e.id ? (
                      <div className="mt-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
                        <QuestionRenderer
                          q={{ ...e.question, content: {}, answerKey: undefined, estimatedSeconds: 90, points: 1, passageId: e.question.passageId }}
                          mode="practice"
                          value={response}
                          onChange={(v) => setResponse(v)}
                        />
                        <div className="mt-3 flex gap-2">
                          <Button onClick={() => checkRetry(e)} disabled={!response}>{t("practice.check")}</Button>
                          <Button variant="outline" onClick={() => { setRetry(null); setResponse(null); }}>{t("common.close")}</Button>
                        </div>
                        {retry.feedback && (
                          <p className="mt-3 font-semibold" role="status">
                            {retry.feedback.correct ? `✓ ${t("practice.correct")}` : `✗ ${t("practice.incorrect")}`}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="lg" onClick={() => { setRetry({ row: e, feedback: null }); setResponse(null); }}>
                          <RefreshCw className="me-2 size-4" aria-hidden />{t("mistakes.retry")}
                        </Button>
                        {e.status !== "MASTERED" && (
                          <Button variant="outline" size="lg" onClick={() => update(e.id, { action: "mastered" })}>
                            <GraduationCap className="me-2 size-4" aria-hidden />{t("mistakes.markMastered")}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Root cause editor */}
                    {e.status !== "MASTERED" && retry?.row.id !== e.id && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-semibold text-primary">{t("mistakes.rootCause")} · {t("mistakes.errorType")}</summary>
                        <div className="mt-2 space-y-2">
                          <Textarea
                            defaultValue={e.rootCause}
                            rows={2}
                            aria-label={t("mistakes.rootCause")}
                            onBlur={(ev) => ev.target.value !== e.rootCause && update(e.id, { rootCause: ev.target.value })}
                          />
                          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("mistakes.errorType")}>
                            {errorTypeOptions.map((et) => (
                              <button
                                key={et}
                                onClick={() => update(e.id, { errorType: et })}
                                className={cn(
                                  "rounded-full border px-3 py-1 text-xs font-semibold",
                                  e.errorType === et ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                                )}
                                aria-pressed={e.errorType === et}
                              >
                                {t(errorTypeKey(et))}
                              </button>
                            ))}
                          </div>
                        </div>
                      </details>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function categoryText(c: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    INDEPENDENTLY_INCORRECT: "mistakes.independentlyIncorrect",
    AI_ASSISTED: "mistakes.aiAssisted",
    CORRECT_UNCERTAIN: "mistakes.correctUncertain",
    CORRECT_SLOW: "mistakes.correctSlow",
    MASTERED_AFTER_REVIEW: "mistakes.masteredAfterReview",
  };
  return t(map[c] ?? c);
}
