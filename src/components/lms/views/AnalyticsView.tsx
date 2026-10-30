"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, StatCard, MasteryBar, Chip, ProgressBar } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import { TrendingUp, Users, Database, Activity } from "lucide-react";

interface TeacherCourse {
  id: string; title: string; learners: number; medianProgress: number; completionRate: number;
  avgScorePct: number | null; assessmentCount: number; atRisk: number;
  roster: { id: string; name: string; progressPct: number; avgScore: number | null }[];
  assessments: { id: string; title: string }[];
}
interface ItemAnalysis {
  assessment: { id: string; title: string };
  attempts: number;
  meanScorePct: number | null;
  items: { questionId: string; position: number; type: string; stem: string; skill: string | null; difficultyLabel: number; attempts: number; pValue: number | null; discrimination: number | null; reliable: boolean }[];
}
interface AdminData {
  users: { total: number; byRole: Record<string, number>; active7d: number; new7d: number };
  courses: { total: number; enrollmentByCourse: { title: string; enrollments: number }[]; completionRate: number; newEnrollments7d: number };
  content: { questions: number; questionsByType: Record<string, number>; assessments: number };
  activity: { attempts7d: number; practiceAnswers7d: number; auditEvents: number };
  organizations?: { id: string; name: string; slug: string; users: number; courses: number }[];
}

export function AnalyticsView() {
  const { user, t } = useApp();
  if (["ORG_ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "")) return <AdminAnalytics />;
  return <TeacherAnalytics />;
}

// ── Teacher ──────────────────────────────────────────────────

function TeacherAnalytics() {
  const { t } = useApp();
  const [courses, setCourses] = useState<TeacherCourse[] | null>(null);
  const [itemAnalysis, setItemAnalysis] = useState<ItemAnalysis | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    get<{ courses: TeacherCourse[] }>("/api/analytics/teacher").then((d) => setCourses(d.courses)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadItemAnalysis(assessmentId: string) {
    setItemAnalysis(null);
    get<{ itemAnalysis: ItemAnalysis }>(`/api/analytics/teacher?assessmentId=${assessmentId}`)
      .then((d) => setItemAnalysis(d.itemAnalysis))
      .catch((e) => setError(e.message));
  }

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!courses) return <Loader />;

  const allAssessments = courses.flatMap((c) => c.assessments.map((a) => ({ ...a, courseTitle: c.title })));

  return (
    <div>
      <PageHeader title={t("analytics.title")} subtitle={t("analytics.storageNote")} />

      {courses.length === 0 ? (
        <EmptyState title={t("analytics.noData")} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("nav.courses")} value={courses.length} />
            <StatCard label={t("dash.activeLearners")} value={courses.reduce((a, c) => a + c.learners, 0)} icon={<Users className="size-5" aria-hidden />} />
            <StatCard label={t("dash.atRisk")} value={courses.reduce((a, c) => a + c.atRisk, 0)} />
            <StatCard label={t("assess.title")} value={allAssessments.length} />
          </div>

          {allAssessments.length > 0 && (
            <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-labelledby="ia-h">
              <h2 id="ia-h" className="mb-3 text-lg font-bold">{t("assess.itemAnalysis")}</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                {allAssessments.map((a) => (
                  <Button key={a.id} variant="outline" size="lg" onClick={() => loadItemAnalysis(a.id)}>
                    {a.title}
                  </Button>
                ))}
              </div>
              {itemAnalysis && (
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {itemAnalysis.attempts} {t("assess.title").toLowerCase()} · {t("assess.score")}: {itemAnalysis.meanScorePct ?? "—"}%
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t("assess.itemAnalysis")}</caption>
                      <thead>
                        <tr className="border-b border-border">
                          <th scope="col" className="p-2 text-start font-semibold">#</th>
                          <th scope="col" className="p-2 text-start font-semibold">{t("qbank.stem")}</th>
                          <th scope="col" className="p-2 text-start font-semibold">{t("practice.skill")}</th>
                          <th scope="col" className="p-2 text-end font-semibold">{t("analytics.attempts")}</th>
                          <th scope="col" className="p-2 text-end font-semibold">{t("analytics.pValue")}</th>
                          <th scope="col" className="p-2 text-end font-semibold">{t("analytics.discrimination")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemAnalysis.items.map((it) => (
                          <tr key={it.questionId} className="border-b border-border last:border-0">
                            <td className="p-2 tabular-nums">{it.position + 1}</td>
                            <td className="p-2">{it.stem.slice(0, 60)}…</td>
                            <td className="p-2 text-muted-foreground">{it.skill ?? "—"}</td>
                            <td className="p-2 text-end tabular-nums">{it.attempts}</td>
                            <td className="p-2 text-end tabular-nums font-semibold">
                              {it.pValue === null ? "—" : it.pValue.toFixed(2)}
                              {it.pValue !== null && (it.pValue < 0.3 ? " ▲hard" : it.pValue > 0.85 ? " ▼easy" : "")}
                            </td>
                            <td className="p-2 text-end tabular-nums">
                              {it.discrimination === null ? (
                                <span className="text-muted-foreground">{t("analytics.insufficientSample")}</span>
                              ) : (
                                <span className={it.discrimination < 0.2 ? "font-semibold text-[var(--warning)]" : ""}>{it.discrimination.toFixed(2)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("analytics.method")}: p-value = share correct; discrimination = point-biserial correlation with total score (needs ≥8 attempts).
                  </p>
                </div>
              )}
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {courses.map((c) => (
              <section key={c.id} className="rounded-2xl border border-border bg-card p-5" aria-labelledby={`an-${c.id}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 id={`an-${c.id}`} className="text-lg font-bold">{c.title}</h2>
                  <Button variant="outline" onClick={() => navigate("course", c.id)}>{t("common.view")}</Button>
                </div>
                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted p-2">
                    <p className="text-xl font-bold tabular-nums">{c.learners}</p>
                    <p className="text-xs text-muted-foreground">{t("grades.student")}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <p className="text-xl font-bold tabular-nums">{c.medianProgress}%</p>
                    <p className="text-xs text-muted-foreground">{t("analytics.median")} {t("analytics.completion").toLowerCase()}</p>
                  </div>
                  <div className="rounded-xl bg-muted p-2">
                    <p className="text-xl font-bold tabular-nums">{c.avgScorePct ?? "—"}%</p>
                    <p className="text-xs text-muted-foreground">{t("assess.score")}</p>
                  </div>
                </div>
                {c.roster.length > 0 && (
                  <ul className="space-y-2">
                    {c.roster.map((r) => (
                      <li key={r.id} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-sm font-medium">{r.name}</span>
                        <ProgressBar pct={r.progressPct} label={`${r.name} ${r.progressPct}%`} />
                        <span className="w-12 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{r.avgScore !== null ? `${r.avgScore}%` : "—"}</span>
                        {(r.progressPct < 40 || (r.avgScore !== null && r.avgScore < 50)) && <Chip tone="warning">!</Chip>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Admin ────────────────────────────────────────────────────

function AdminAnalytics() {
  const { t, locale } = useApp();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get<AdminData>("/api/analytics/admin").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNotice message={error} onRetry={() => location.reload()} />;
  if (!data) return <Loader />;

  const localeTag = locale === "ar" ? "ar" : "en";
  const enrollData = data.courses.enrollmentByCourse.map((c) => ({ name: c.title.slice(0, 18), enrollments: c.enrollments }));
  const typeData = Object.entries(data.content.questionsByType).map(([type, count]) => ({ type: type.replace(/_/g, " ").toLowerCase(), count }));

  return (
    <div>
      <PageHeader title={t("analytics.title")} subtitle={t("analytics.storageNote")} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("nav.users")} value={data.users.total} icon={<Users className="size-5" aria-hidden />} hint={`+${data.users.new7d} (7d)`} />
        <StatCard label={t("dash.activeLearners")} value={data.users.active7d} icon={<Activity className="size-5" aria-hidden />} />
        <StatCard label={t("nav.courses")} value={data.courses.total} hint={`${data.courses.completionRate}% ${t("analytics.completion").toLowerCase()}`} />
        <StatCard label={t("qbank.title")} value={data.content.questions} icon={<Database className="size-5" aria-hidden />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5" aria-label={t("analytics.enrollments")}>
          <h2 className="mb-4 text-lg font-bold">{t("analytics.enrollments")}</h2>
          {enrollData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrollData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={0} angle={-20} height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                  <Bar dataKey="enrollments" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("analytics.noData")}</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5" aria-label={t("analytics.questionMix")}>
          <h2 className="mb-4 text-lg font-bold">{t("analytics.questionMix")}</h2>
          {typeData.length > 0 ? (
            <ul className="space-y-2">
              {typeData.sort((a, b) => b.count - a.count).map((td, i) => (
                <li key={td.type} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-sm font-medium">{td.type}</span>
                  <ProgressBar pct={(td.count / data.content.questions) * 100} label={`${td.type}: ${td.count}`} />
                  <span className="w-8 shrink-0 text-end text-sm tabular-nums">{td.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("analytics.noData")}</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5" aria-label={t("nav.users")}>
          <h2 className="mb-4 text-lg font-bold">{t("nav.users")}</h2>
          <ul className="grid grid-cols-2 gap-2">
            {Object.entries(data.users.byRole).map(([role, count]) => (
              <li key={role} className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="text-sm font-medium">{role.replace(/_/g, " ").toLowerCase()}</span>
                <span className="text-lg font-bold tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5" aria-label="Activity">
          <h2 className="mb-4 text-lg font-bold">{t("dash.upcoming")} · 7d</h2>
          <ul className="space-y-2 text-base">
            <li className="flex justify-between rounded-xl border border-border p-3"><span>{t("assess.attempts")}</span><span className="font-bold tabular-nums">{data.activity.attempts7d}</span></li>
            <li className="flex justify-between rounded-xl border border-border p-3"><span>{t("practice.title")}</span><span className="font-bold tabular-nums">{data.activity.practiceAnswers7d}</span></li>
            <li className="flex justify-between rounded-xl border border-border p-3"><span>{t("nav.audit")}</span><span className="font-bold tabular-nums">{data.activity.auditEvents}</span></li>
            <li className="flex justify-between rounded-xl border border-border p-3"><span>{t("assess.title")}</span><span className="font-bold tabular-nums">{data.content.assessments}</span></li>
          </ul>
        </section>
      </div>

      {data.organizations && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5" aria-label={t("nav.organizations")}>
          <h2 className="mb-3 text-lg font-bold">{t("nav.organizations")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.organizations.map((o) => (
              <li key={o.id} className="rounded-xl border border-border p-3">
                <p className="font-semibold">{o.name}</p>
                <p className="text-sm text-muted-foreground">{o.users} {t("admin.memberCount")} · {o.courses} {t("nav.courses").toLowerCase()}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
