"use client";

import { useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, ProgressBar } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { BookOpen, Plus, Clock, Users } from "lucide-react";

interface CourseCard {
  id: string; title: string; description: string; status: string; format: string;
  estimatedHours: number; ownerName: string | null; lessonCount: number;
  enrolled: boolean; enrollmentCount: number;
}

export function CoursesView() {
  const { user, t } = useApp();
  const [courses, setCourses] = useState<CourseCard[] | null>(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const canCreate = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "");

  useEffect(() => {
    get<{ courses: CourseCard[] }>("/api/courses").then((d) => setCourses(d.courses)).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNotice message={error} onRetry={() => location.reload()} />;
  if (!courses) return <Loader />;

  return (
    <div>
      <PageHeader
        title={t("courses.title")}
        subtitle={t("courses.subtitle")}
        actions={canCreate && <Button size="lg" onClick={() => setShowNew(true)}><Plus className="me-2 size-5" aria-hidden />{t("courses.newCourse")}</Button>}
      />

      {courses.length === 0 ? (
        <EmptyState title={t("courses.emptyCatalog")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id}>
              <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold leading-snug">{c.title}</h2>
                  {c.status !== "PUBLISHED" && (
                    <span className="rounded-full border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                      {c.status === "DRAFT" ? t("qbank.draft") : c.status}
                    </span>
                  )}
                </div>
                <p className="mb-3 line-clamp-3 flex-1 text-muted-foreground">{c.description || "—"}</p>
                <dl className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1"><Clock className="size-4" aria-hidden />{t("courses.estimated", { hours: c.estimatedHours })}</div>
                  <div className="flex items-center gap-1"><BookOpen className="size-4" aria-hidden />{c.lessonCount} {t("courses.lessons")}</div>
                  {c.ownerName && <div className="flex items-center gap-1"><Users className="size-4" aria-hidden />{c.ownerName}</div>}
                </dl>
                <div className="flex gap-2">
                  {c.enrolled || user?.role !== "STUDENT" ? (
                    <Button className="flex-1" size="lg" onClick={() => navigate("course", c.id)}>{t("courses.enter")}</Button>
                  ) : (
                    <Button className="flex-1" size="lg" variant="outline" onClick={() => enroll(c.id)}>{t("courses.enroll")}</Button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {showNew && <NewCourseDialog onClose={() => setShowNew(false)} onCreated={(id) => navigate("course", id)} />}
    </div>
  );

  async function enroll(courseId: string) {
    try {
      await post(`/api/courses/${courseId}/enroll`);
      toast({ title: t("courses.enrolled") });
      navigate("course", courseId);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }
}

function NewCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({ title: "", description: "", format: "SELF_PACED" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await post<{ course: { id: string } }>("/api/courses", form);
      onCreated(data.course.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("courses.newCourse")}</DialogTitle>
          <DialogDescription>{t("courses.title")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="ct">{t("courses.courseTitle")}</Label>
            <Input id="ct" required minLength={3} className="mt-1 min-h-11 text-base" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cd">{t("courses.description")}</Label>
            <Textarea id="cd" className="mt-1 text-base" rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cf">{t("courses.format")}</Label>
            <select id="cf" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base" value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}>
              <option value="SELF_PACED">{t("courses.selfPaced")}</option>
              <option value="INSTRUCTOR_LED">{t("courses.instructorLed")}</option>
              <option value="BLENDED">{t("courses.blended")}</option>
            </select>
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={busy}>{t("common.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
