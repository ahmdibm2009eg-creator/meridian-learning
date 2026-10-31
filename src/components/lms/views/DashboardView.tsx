"use client";

import { useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, StatCard, MasteryBar, Chip, ProgressBar, EmptyState } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/components/lms/AppRoot";
import { Flame, Target, Clock, ListChecks, TrendingUp, Dumbbell, CalendarCheck, GraduationCap, AlertCircle, BookOpen } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

interface StudentData {
  trend: { date: string; accuracy: number | null; total: number }[];
  streak: number;
  mastery: (import("@/lib/types").MasteryEstimate & { parentName?: string | null })[];
  readiness: { estimate: number; low: number; high: number; skillsMeasured: number } | null;
  totals: { questionsAnswered: number; minutesStudied: number; dueMistakes: number; dueVocab: number };
  courses: { id: string; title: string; progressPct: number; totalLessons: number; completedLessons: number }[];
  recentMistakes: { id: string; stem: string; category: string; skill: string | null; due: string | null }[];
  unreadNotifications: number;
  tasks: { id: string; title: string; dueDate: string; type: string; reason: string }[];
  upcomingEvents: { id: string; title: string; startAt: string; type: string }[];
  recommendation: { title: string; reason: string; view: string; viewId?: string } | null;
}

export function DashboardView() {
  const { user, t, locale } = useApp();
  const isStudent = user?.role === "STUDENT" || user?.role === "PARENT";
  const isStaff = user?.role === "TEACHER" || user?.role === "AUTHOR";
  const isAdmin = user?.role === "ORG_ADMIN" || user?.role === "SUPER_ADMIN";

  if (isStudent) return <StudentDashboard />;
  if (isStaff) return <StaffDashboard />;
  if (isAdmin) return <AdminDashboard />;
  return null;
}

// ── Student ──────────────────────────────────────────────────

function StudentDashboard() {
  const { t, locale } = useApp();
  const [data, setData] = useState<StudentData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get<StudentData>("/api/analytics/student").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNotice message={error} />;
  if (!data) return <Loader />;

  const localeTag = locale === "ar" ? "ar" : "en";
  const trend = data.trend.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString(localeTag, { month: "short", day: "numeric" }) }));
  const weakest = data.mastery.filter((m) => m.correct + m.incorrect >= 2).slice(0, 4);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString(localeTag, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <PageHeader title={t("dash.greeting", { name: useApp.getState().user?.name?.split(" ")[0] ?? "" })} subtitle={t("dash.readinessNote")} />

      {data.recommendation && (
        <section className="mb-6 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5" aria-label={t("dash.recommended")}>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{t("dash.recommended")}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-bold">{data.recommendation.title}</p>
              <p className="mt-0.5 text-muted-foreground">{data.recommendation.reason}</p>
            </div>
            <Button size="lg" onClick={() => navigate(data.recommendation!.view, data.recommendation!.viewId)}>
              {t("common.start")}
            </Button>
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("dash.streak")} value={<span className="flex items-center gap-1.5">{data.streak} <span className="text-base font-normal">{t("dash.days")}</span></span>} icon={<Flame className="size-5" aria-hidden />} />
        <StatCard label={t("dash.questionsAnswered")} value={data.totals.questionsAnswered} icon={<Target className="size-5" aria-hidden />} />
        <StatCard label={t("dash.hoursStudied")} value={(data.totals.minutesStudied / 60).toFixed(1)} icon={<Clock className="size-5" aria-hidden />} />
        <StatCard label={t("dash.dueReviews")} value={data.totals.dueMistakes + data.totals.dueVocab} icon={<ListChecks className="size-5" aria-hidden />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-border bg-card p-5 lg:col-span-2" aria-label={t("dash.accuracy")}>
          <h2 className="mb-3 text-lg font-bold">{t("dash.accuracy")}</h2>
          {trend.length >= 2 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                    formatter={((v: unknown) => [v === null || v === undefined ? "—" : `${v}%`, t("dash.accuracy")]) as never}
                  />
                  <ReferenceLine y={60} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "pass 60%", fill: "var(--warning)", fontSize: 11 }} />
                  <Line type="monotone" dataKey="accuracy" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title={t("dash.noMasteryYet")} hint={t("dash.startDiagnostic")}
              action={<Button onClick={() => navigate("assessments")}>{t("dash.startDiagnostic")}</Button>} />
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-label={t("dash.readiness")}>
          <h2 className="mb-3 text-lg font-bold">{t("dash.readiness")}</h2>
          {data.readiness ? (
            <div>
              <p className="text-4xl font-bold tabular-nums">{Math.round(data.readiness.estimate * 100)}<span className="text-xl">%</span></p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {Math.round(data.readiness.low * 100)}–{Math.round(data.readiness.high * 100)}% · {data.readiness.skillsMeasured} skills
              </p>
              <ProgressBar pct={data.readiness.estimate * 100} label={t("dash.readiness")} />
              <p className="mt-3 text-xs text-muted-foreground">{t("analytics.masteryMethod")}</p>
            </div>
          ) : (
            <EmptyState title={t("dash.noMasteryYet")} hint={t("analytics.noData")} />
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-label={t("dash.masteryFocus")}>
          <h2 className="mb-4 text-lg font-bold">{t("dash.masteryFocus")}</h2>
          {weakest.length > 0 ? (
            <div className="space-y-4">
              {weakest.map((m) => <MasteryBar key={m.nodeId} m={m} />)}
              <Button variant="outline" className="w-full" onClick={() => navigate("practice")}>
                <Dumbbell className="me-2 size-4" aria-hidden />
                {t("practice.start")}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("dash.noMasteryYet")}</p>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-label={t("dash.myCourses")}>
          <h2 className="mb-4 text-lg font-bold">{t("dash.myCourses")}</h2>
          {data.courses.length > 0 ? (
            <ul className="space-y-4">
              {data.courses.map((c) => (
                <li key={c.id}>
                  <button className="w-full text-start" onClick={() => navigate("course", c.id)}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="font-semibold hover:underline">{c.title}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">{t("courses.progress", { pct: c.progressPct })}</span>
                    </div>
                    <ProgressBar pct={c.progressPct} label={`${c.title} ${c.progressPct}%`} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("courses.emptyCatalog")} action={<Button onClick={() => navigate("courses")}>{t("courses.title")}</Button>} />
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-card p-5" aria-label={t("dash.recentMistakes")}>
          <h2 className="mb-3 text-lg font-bold">{t("dash.recentMistakes")}</h2>
          {data.recentMistakes.length > 0 ? (
            <ul className="space-y-2.5">
              {data.recentMistakes.map((m) => (
                <li key={m.id} className="rounded-xl border border-border p-3">
                  <p className="line-clamp-2 text-sm font-medium">{m.stem}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Chip tone="danger">{categoryLabel(m.category, t)}</Chip>
                    {m.skill && <Chip tone="muted">{m.skill}</Chip>}
                  </div>
                </li>
              ))}
              <Button variant="outline" className="w-full" onClick={() => navigate("mistakes")}>
                <ListChecks className="me-2 size-4" aria-hidden />
                {t("mistakes.title")} ({data.totals.dueMistakes} {t("mistakes.due")})
              </Button>
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("mistakes.empty")}</p>
          )}
        </section>
      </div>

      {(data.tasks.length > 0 || data.upcomingEvents.length > 0) && (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          {data.tasks.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5" aria-label={t("nav.studyPlan")}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t("plan.today")} · {t("plan.thisWeek")}</h2>
                <Button variant="ghost" onClick={() => navigate("study-plan")}>{t("common.view")}</Button>
              </div>
              <ul className="space-y-2">
                {data.tasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                    <CalendarCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(task.dueDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.upcomingEvents.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5" aria-label={t("dash.upcoming")}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t("dash.upcoming")}</h2>
                <Button variant="ghost" onClick={() => navigate("calendar")}>{t("common.view")}</Button>
              </div>
              <ul className="space-y-2">
                {data.upcomingEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <BookOpen className="size-5 shrink-0 text-primary" aria-hidden />
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(e.startAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function categoryLabel(category: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    INDEPENDENTLY_INCORRECT: "mistakes.independentlyIncorrect",
    AI_ASSISTED: "mistakes.aiAssisted",
    CORRECT_UNCERTAIN: "mistakes.correctUncertain",
    CORRECT_SLOW: "mistakes.correctSlow",
    MASTERED_AFTER_REVIEW: "mistakes.masteredAfterReview",
  };
  return t(map[category] ?? "mistakes.uncategorized");
}

// ── Teacher / admin stubs (real analytics live in AnalyticsView) ──

function StaffDashboard() {
  const t = useApp((s) => s.t);
  return (
    <div>
      <PageHeader title={t("dash.greeting", { name: useApp.getState().user?.name?.split(" ")[0] ?? "" })} subtitle={t("dash.classSnapshot")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("courses")}>
          <BookOpen className="size-6" aria-hidden /> {t("nav.courses")}
        </Button>
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("question-bank")}>
          <Dumbbell className="size-6" aria-hidden /> {t("nav.questionBank")}
        </Button>
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("analytics")}>
          <TrendingUp className="size-6" aria-hidden /> {t("nav.analytics")}
        </Button>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const t = useApp((s) => s.t);
  return (
    <div>
      <PageHeader title={t("dash.greeting", { name: useApp.getState().user?.name?.split(" ")[0] ?? "" })} subtitle={t("dash.orgHealth")} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("users")}>
          <GraduationCap className="size-6" aria-hidden /> {t("nav.users")}
        </Button>
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("analytics")}>
          <TrendingUp className="size-6" aria-hidden /> {t("nav.analytics")}
        </Button>
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("organizations")}>
          <AlertCircle className="size-6" aria-hidden /> {t("nav.organizations")}
        </Button>
        <Button size="lg" variant="outline" className="min-h-20 flex-col gap-1" onClick={() => navigate("audit")}>
          <ListChecks className="size-6" aria-hidden /> {t("nav.audit")}
        </Button>
      </div>
    </div>
  );
}
