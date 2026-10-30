"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useApp as useStore } from "@/lib/store";
import { ClipboardList, Clock, PlayCircle, RotateCcw, FileText, Plus } from "lucide-react";

interface AssessmentRow {
  id: string; title: string; description: string; type: string; status: string;
  timeLimitMin: number | null; attemptsAllowed: number; feedbackMode: string; passScorePct: number;
  availableTo: string | null;
  course: { id: string; title: string } | null;
  questionCount: number;
  myAttempts: { id: string; status: string; score: number | null; maxScore: number | null; submittedAt: string | null }[];
  attemptsUsed: number;
  inProgress: boolean;
  bestScore: number | null;
}

export function AssessmentsView() {
  const { user, t, locale } = useApp();
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [error, setError] = useState("");
  const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "");
  const localeTag = locale === "ar" ? "ar" : "en";

  const load = useCallback(() => {
    get<{ assessments: AssessmentRow[] }>("/api/assessments").then((d) => setRows(d.assessments)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!rows) return <Loader />;

  async function start(id: string) {
    try {
      const res = await post<{ attemptId: string; resumed: boolean }>(`/api/assessments/${id}/attempts`);
      navigate("exam", res.attemptId);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  const typeLabel = (ty: string) => t(`assess.type.${ty.toLowerCase().replace(" ", "_")}`) ?? ty;

  return (
    <div>
      <PageHeader
        title={isStaff ? t("nav.builder") : t("assess.title")}
        subtitle={isStaff ? undefined : t("assess.subtitle")}
        actions={isStaff && <Button size="lg" onClick={() => navigate("assessment-builder")}><Plus className="me-2 size-5" aria-hidden />{t("assess.newAssessment")}</Button>}
      />

      {rows.length === 0 ? (
        <EmptyState title={t("common.empty")} hint={isStaff ? undefined : t("courses.emptyCatalog")} />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const exhausted = !a.inProgress && a.attemptsUsed >= a.attemptsAllowed;
            const last = a.myAttempts.find((m) => m.submittedAt);
            return (
              <li key={a.id}>
                <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{a.title}</h2>
                      <Chip tone="primary">{typeLabel(a.type)}</Chip>
                      {a.course && <Chip tone="muted">{a.course.title}</Chip>}
                      {a.status === "DRAFT" && <Chip tone="warning">{t("qbank.draft")}</Chip>}
                    </div>
                    {a.description && <p className="mt-1 line-clamp-2 text-muted-foreground">{a.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><FileText className="size-4" aria-hidden />{a.questionCount} {t("assess.questions")}</span>
                      <span className="flex items-center gap-1"><Clock className="size-4" aria-hidden />{a.timeLimitMin ? t("assess.timeLimit", { min: a.timeLimitMin }) : t("assess.noLimit")}</span>
                      <span>{t("assess.passScore", { pct: a.passScorePct })}</span>
                      <span>{a.attemptsUsed}/{a.attemptsAllowed} {t("assess.attempts")}</span>
                      {a.bestScore !== null && <span className="font-semibold text-primary">{t("assess.score")}: {a.bestScore}%</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {a.inProgress ? (
                      <Button size="lg" onClick={() => {
                        const ip = a.myAttempts.find((m) => m.status === "IN_PROGRESS");
                        if (ip) navigate("exam", ip.id); else start(a.id);
                      }}>
                        <PlayCircle className="me-2 size-5" aria-hidden />
                        {t("assess.continueAttempt")}
                      </Button>
                    ) : a.status !== "PUBLISHED" && !isStaff ? null : exhausted ? (
                      <Button size="lg" variant="outline" disabled title={t("assess.attemptLimit")}>
                        <RotateCcw className="me-2 size-5" aria-hidden />
                        {t("assess.attemptLimit")}
                      </Button>
                    ) : (
                      <Button size="lg" onClick={() => start(a.id)}>
                        <PlayCircle className="me-2 size-5" aria-hidden />
                        {a.attemptsUsed > 0 ? t("assess.retake") : t("assess.startAttempt")}
                      </Button>
                    )}
                    {isStaff && (
                      <Button size="lg" variant="outline" onClick={() => navigate("assessment-builder", a.id)}>
                        <ClipboardList className="me-2 size-5" aria-hidden />
                        {t("common.edit")}
                      </Button>
                    )}
                    {a.myAttempts.length > 0 && (
                      <Button size="lg" variant="outline" onClick={() => {
                        const graded = a.myAttempts.find((m) => m.status !== "IN_PROGRESS");
                        if (graded) navigate("exam", graded.id);
                      }}>
                        {t("assess.viewResults")}
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
