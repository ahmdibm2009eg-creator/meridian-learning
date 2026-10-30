"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post, patch } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, ProgressBar, Chip } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PlayCircle, CheckCircle2, Plus, Megaphone, ClipboardList, Users, BookOpen, Lock } from "lucide-react";

interface CourseDetail {
  course: { id: string; title: string; description: string; status: string; format: string; estimatedHours: number; ownerName: string | null; ownerId: string | null };
  sections: { id: string; title: string; summary: string; lessons: { id: string; title: string; type: string; durationMin: number; completed: boolean }[] }[];
  totalLessons: number;
  completedLessons: number;
  progressPct: number;
  enrolled: boolean;
  isTeacher: boolean;
  nextLessonId: string | null;
  roster: { id: string; name: string; email: string; status: string; completedLessons: number; progressPct: number }[];
  assignments: { id: string; title: string; instructions: string; dueAt: string | null; points: number }[];
  assessments: { id: string; title: string; type: string }[];
  announcements: { id: string; title: string; body: string; createdAt: string }[];
}

export function CourseDetailView({ courseId }: { courseId: string }) {
  const { user, t, locale } = useApp();
  const [data, setData] = useState<CourseDetail | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<null | "section" | "lesson" | "announcement" | "assignment">(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const load = useCallback(() => {
    get<CourseDetail>(`/api/courses/${courseId}`).then(setData).catch((e) => setError(e.message));
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!data) return <Loader />;

  const canEdit = data.isTeacher;
  const localeTag = locale === "ar" ? "ar" : "en";

  return (
    <div>
      <PageHeader
        title={data.course.title}
        subtitle={data.course.description}
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => navigate("courses")}>← {t("courses.title")}</Button>
            {user?.role === "STUDENT" && !data.enrolled && (
              <Button size="lg" onClick={async () => { await post(`/api/courses/${courseId}/enroll`).catch(() => {}); load(); }}>
                {t("courses.enroll")}
              </Button>
            )}
            {user?.role === "STUDENT" && data.enrolled && data.nextLessonId ? (
              <Button size="lg" onClick={() => navigate("lesson", data.nextLessonId!)}>
                <PlayCircle className="me-2 size-5" aria-hidden />
                {t("common.continue")}
              </Button>
            ) : null}
          </>
        }
      />

      {!data.enrolled && user?.role === "STUDENT" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-[var(--warning)]/40 bg-[var(--warning)]/10 p-4" role="status">
          <Lock className="size-5 shrink-0" aria-hidden />
          <p className="font-medium">{t("courses.notEnrolled")}</p>
          <Button className="ms-auto" onClick={async () => { await post(`/api/courses/${courseId}/enroll`).catch(() => {}); load(); }}>
            {t("courses.enroll")}
          </Button>
        </div>
      )}

      <Tabs defaultValue="content">
        <TabsList className="mb-4">
          <TabsTrigger value="content" className="text-base">{t("courses.lessons")}</TabsTrigger>
          <TabsTrigger value="assessments" className="text-base">{t("nav.assessments")}</TabsTrigger>
          <TabsTrigger value="assignments" className="text-base">Assignments</TabsTrigger>
          <TabsTrigger value="announcements" className="text-base">{t("announcements.title")}</TabsTrigger>
          {canEdit && <TabsTrigger value="roster" className="text-base">{t("grades.student")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="content">
          {canEdit && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog("section")}><Plus className="me-2 size-4" aria-hidden />{t("courses.addSection")}</Button>
              {data.sections.length > 0 && <Button variant="outline" onClick={() => setDialog("lesson")}><Plus className="me-2 size-4" aria-hidden />{t("courses.addLesson")}</Button>}
            </div>
          )}

          {data.enrolled && (
            <div className="mb-6 rounded-xl border border-border bg-card p-4" aria-label={t("dash.progress")}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-semibold">{t("dash.progress")}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {data.completedLessons}/{data.totalLessons} · {t("courses.progress", { pct: data.progressPct })}
                </span>
              </div>
              <ProgressBar pct={data.progressPct} />
            </div>
          )}

          {data.sections.length === 0 ? (
            <EmptyState title={t("common.empty")} hint={canEdit ? t("courses.addSection") : undefined} />
          ) : (
            <div className="space-y-5">
              {data.sections.map((s, si) => (
                <section key={s.id} className="rounded-2xl border border-border bg-card p-5" aria-labelledby={`sec-${s.id}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 id={`sec-${s.id}`} className="text-lg font-bold">
                        <span className="me-2 text-muted-foreground">{si + 1}.</span>{s.title}
                      </h2>
                      {s.summary && <p className="mt-0.5 text-sm text-muted-foreground">{s.summary}</p>}
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => { setActiveSection(s.id); setDialog("lesson"); }}>
                        <Plus className="me-1 size-4" aria-hidden />{t("courses.addLesson")}
                      </Button>
                    )}
                  </div>
                  {s.lessons.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{t("common.empty")}</p>
                  ) : (
                    <ol className="space-y-2">
                      {s.lessons.map((l) => (
                        <li key={l.id}>
                          <button
                            onClick={() => navigate("lesson", l.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border p-3 text-start hover:bg-muted",
                              l.completed ? "border-[var(--success)]/40 bg-[var(--success)]/5" : "border-border"
                            )}
                          >
                            {l.completed ? (
                              <CheckCircle2 className="size-6 shrink-0 text-[var(--success)]" aria-label={t("courses.completed")} />
                            ) : (
                              <PlayCircle className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className={cn("block font-medium", l.completed && "text-muted-foreground")}>{l.title}</span>
                              <span className="block text-xs text-muted-foreground">
                                {lessonTypeLabel(l.type, t)} · {t("lesson.duration", { min: l.durationMin })}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assessments">
          {data.assessments.length === 0 ? (
            <EmptyState title={t("common.empty")} />
          ) : (
            <ul className="space-y-2">
              {data.assessments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                  <span className="flex items-center gap-3">
                    <ClipboardList className="size-5 text-primary" aria-hidden />
                    <span className="font-medium">{a.title}</span>
                  </span>
                  <Button variant="outline" onClick={() => navigate("assessments")}>{t("common.view")}</Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="assignments">
          {data.assignments.length === 0 ? (
            <EmptyState title={t("common.empty")} />
          ) : (
            <ul className="space-y-2">
              {data.assignments.map((a) => (
                <li key={a.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Chip tone="muted">{a.points} {t("common.points")}</Chip>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.instructions}</p>
                  {a.dueAt && (
                    <p className="mt-2 text-sm">
                      <Chip tone="warning">{t("cal.type.deadline")}: {new Date(a.dueAt).toLocaleDateString(localeTag, { month: "short", day: "numeric" })}</Chip>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="announcements">
          {canEdit && (
            <div className="mb-4">
              <Button variant="outline" onClick={() => setDialog("announcement")}><Megaphone className="me-2 size-4" aria-hidden />{t("announcements.post")}</Button>
            </div>
          )}
          {data.announcements.length === 0 ? (
            <EmptyState title={t("announcements.empty")} />
          ) : (
            <ul className="space-y-3">
              {data.announcements.map((a) => (
                <li key={a.id} className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString(localeTag, { month: "long", day: "numeric" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {canEdit && (
          <TabsContent value="roster">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-start text-sm">
                <caption className="sr-only">{t("grades.student")}</caption>
                <thead className="border-b border-border bg-muted/50 text-start">
                  <tr>
                    <th scope="col" className="p-3 text-start font-semibold">{t("common.name")}</th>
                    <th scope="col" className="p-3 text-start font-semibold">{t("common.status")}</th>
                    <th scope="col" className="p-3 text-start font-semibold">{t("analytics.completion")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roster.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">{r.status}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={r.progressPct} />
                          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{r.progressPct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.roster.length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{t("common.empty")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {dialog === "section" && (
        <NewSectionDialog courseId={courseId} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />
      )}
      {dialog === "lesson" && (
        <NewLessonDialog courseId={courseId} sectionId={activeSection ?? data.sections[0]?.id} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />
      )}
      {dialog === "announcement" && (
        <NewAnnouncementDialog courseId={courseId} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} />
      )}
    </div>
  );
}

function lessonTypeLabel(type: string, t: (k: string) => string) {
  const map: Record<string, string> = { READING: "courses.reading", VIDEO: "courses.video", PRACTICE: "courses.practiceLesson", INTERACTIVE: "courses.practiceLesson" };
  return t(map[type] ?? "courses.reading");
}

function NewSectionDialog({ courseId, onClose, onDone }: { courseId: string; onClose: () => void; onDone: () => void }) {
  const t = useApp((s) => s.t);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/api/courses/${courseId}/sections`, { title });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("courses.addSection")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="st">{t("courses.sectionTitle")}</Label>
            <Input id="st" required className="mt-1 min-h-11 text-base" value={title} onChange={(e) => setTitle(e.target.value)} />
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

function NewLessonDialog({ courseId, sectionId, onClose, onDone }: { courseId: string; sectionId?: string; onClose: () => void; onDone: () => void }) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({ title: "", content: "", type: "READING", durationMin: 20, objectives: [""], sectionId: sectionId ?? "" });
  const [sections, setSections] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    get<{ sections: { id: string; title: string }[] }>(`/api/courses/${courseId}`).then((d) => {
      setSections(d.sections);
      setForm((f) => ({ ...f, sectionId: f.sectionId || d.sections[0]?.id || "" }));
    });
  }, [courseId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sectionId) return;
    setBusy(true);
    try {
      await post(`/api/sections/${form.sectionId}/lessons`, {
        title: form.title,
        content: form.content,
        type: form.type,
        durationMin: Number(form.durationMin) || 20,
        objectives: form.objectives.filter(Boolean),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("courses.addLesson")}</DialogTitle>
          <DialogDescription>{t("courses.lessonContent")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="lt">{t("courses.lessonTitle")}</Label>
            <Input id="lt" required className="mt-1 min-h-11 text-base" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="lsec">{t("courses.sectionTitle")}</Label>
              <select id="lsec" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base" value={form.sectionId}
                onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="ltype">{t("courses.lessonType")}</Label>
              <select id="ltype" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base" value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="READING">{t("courses.reading")}</option>
                <option value="VIDEO">{t("courses.video")}</option>
                <option value="PRACTICE">{t("courses.practiceLesson")}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="ldur">{t("common.minutes")}</Label>
              <Input id="ldur" type="number" min={1} max={600} className="mt-1 min-h-11 text-base" value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label htmlFor="lobj">{t("courses.objectives")}</Label>
            <div className="mt-1 space-y-2">
              {form.objectives.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="min-h-11 text-base" value={o} placeholder={`${t("courses.objective")} ${i + 1}`}
                    onChange={(e) => { const next = [...form.objectives]; next[i] = e.target.value; setForm({ ...form, objectives: next }); }} />
                  {form.objectives.length > 1 && (
                    <Button type="button" variant="ghost" onClick={() => setForm({ ...form, objectives: form.objectives.filter((_, j) => j !== i) })} aria-label={t("common.delete")}>✕</Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, objectives: [...form.objectives, ""] })}>
                {t("courses.addObjective")}
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="lc">{t("courses.lessonContent")}</Label>
            <Textarea id="lc" rows={10} className="mt-1 font-mono text-sm" value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Markdown: ## headings, **bold**, lists, tables. Inline math: \(x^2\).</p>
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

function NewAnnouncementDialog({ courseId, onClose, onDone }: { courseId: string; onClose: () => void; onDone: () => void }) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/api/announcements", { ...form, courseId });
      toast({ title: t("announcements.post") + " ✓" });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("announcements.post")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="at">{t("announcements.newTitle")}</Label>
            <Input id="at" required minLength={3} className="mt-1 min-h-11 text-base" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="ab">{t("announcements.body")}</Label>
            <Textarea id="ab" required minLength={3} rows={5} className="mt-1 text-base" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
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
