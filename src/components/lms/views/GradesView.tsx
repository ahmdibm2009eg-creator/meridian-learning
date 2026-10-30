"use client";

import { useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, StatCard } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Trophy, Percent } from "lucide-react";

interface GradeRow {
  id: string; student: { id: string; name: string }; itemType: string; title: string;
  score: number; maxScore: number; weight: number; category: string; comment: string;
  gradedBy: string | null; gradedAt: string; assessmentId: string | null;
}
interface GradesData {
  isTeacher: boolean;
  course: { id: string; title: string };
  entries: GradeRow[];
  totals: { studentId: string; name: string; weightedPct: number | null }[];
}

export function GradesView() {
  const { user, t, locale } = useApp();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [courseId, setCourseId] = useState<string>("all");
  const [data, setData] = useState<GradesData | null>(null);
  const [error, setError] = useState("");
  const localeTag = locale === "ar" ? "ar" : "en";

  useEffect(() => {
    get<{ courses: { id: string; title: string; enrolled: boolean }[] }>("/api/courses").then((d) => {
      const mine = d.courses.filter((c) => c.enrolled || ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user?.role ?? ""));
      setCourses(mine);
    });
  }, [user?.role]);

  useEffect(() => {
    get<GradesData>(`/api/gradebook${courseId !== "all" ? `?courseId=${courseId}` : ""}`).then(setData).catch((e) => setError(e.message));
  }, [courseId]);

  if (error) return <ErrorNotice message={error} onRetry={() => setError("")} />;
  if (!data || data.course.id !== courseId) return <Loader />;

  const myTotal = data.totals.find((tt) => tt.studentId === user?.id);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString(localeTag, { month: "short", day: "numeric" });

  return (
    <div>
      <PageHeader
        title={t("grades.title")}
        subtitle={t("grades.subtitle")}
        actions={
          <select
            aria-label={t("grades.course")}
            className="min-h-11 rounded-lg border border-input bg-card px-3 text-base"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="all">{t("common.all")}</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        }
      />

      {!data.isTeacher && myTotal && myTotal.weightedPct !== null && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label={t("grades.weightedTotal")} value={`${myTotal.weightedPct}%`} icon={<Percent className="size-5" aria-hidden />} />
          <StatCard label={t("grades.item")} value={data.entries.length} icon={<Trophy className="size-5" aria-hidden />} />
          <StatCard label={t("grades.category")} value={new Set(data.entries.map((e) => e.category)).size} />
        </div>
      )}

      {data.entries.length === 0 ? (
        <EmptyState title={t("grades.noGrades")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("grades.gradebook")}</caption>
            <thead className="border-b border-border bg-muted/50">
              <tr>
                {data.isTeacher && <th scope="col" className="p-3 text-start font-semibold">{t("grades.student")}</th>}
                <th scope="col" className="p-3 text-start font-semibold">{t("grades.item")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("grades.category")}</th>
                <th scope="col" className="p-3 text-end font-semibold">{t("grades.score")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.date")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("grades.comment")}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  {data.isTeacher && <td className="p-3 font-medium">{e.student.name}</td>}
                  <td className="p-3 font-medium">
                    {e.title}
                    {e.assessmentId && (
                      <Button variant="ghost" size="sm" className="ms-2 text-xs" onClick={() => navigate("assessments")}>
                        {t("assess.viewResults")}
                      </Button>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{e.category}</td>
                  <td className="p-3 text-end font-bold tabular-nums">
                    {e.score}/{e.maxScore}
                    <span className="ms-1 text-xs text-muted-foreground">({Math.round((e.score / Math.max(1, e.maxScore)) * 100)}%)</span>
                  </td>
                  <td className="p-3 text-muted-foreground">{fmtDate(e.gradedAt)}</td>
                  <td className="p-3 text-muted-foreground">{e.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.isTeacher && data.totals.length > 0 && (
        <section className="mt-6" aria-label={t("grades.weightedTotal")}>
          <h2 className="mb-3 text-lg font-bold">{t("grades.weightedTotal")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.totals.map((tt) => (
              <li key={tt.studentId} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                <span className="font-medium">{tt.name}</span>
                <span className="text-xl font-bold tabular-nums text-primary">{tt.weightedPct === null ? "—" : `${tt.weightedPct}%`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
