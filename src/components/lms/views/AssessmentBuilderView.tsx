"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post, patch } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FilePlus2, Plus, Save, CheckCircle2, ArrowLeft, Wand2 } from "lucide-react";

interface QuestionRow {
  id: string; type: string; stem: string; difficulty: number; reviewStatus: string;
  taxonomy: { id: string; name: string } | null; answerKey: any; content: any;
  estimatedSeconds: number; points: number;
}
interface AssessmentData {
  assessment: {
    id: string; title: string; description: string; type: string; status: string;
    timeLimitMin: number | null; attemptsAllowed: number; shuffleQuestions: boolean; shuffleOptions: boolean;
    feedbackMode: string; passScorePct: number; courseId: string | null;
    course: { id: string; title: string } | null;
    items: { id: string; position: number; points: number; question: QuestionRow }[];
  };
  isStaff: boolean;
}

export function AssessmentBuilderView({ assessmentId }: { assessmentId?: string }) {
  const { t } = useApp();
  const [data, setData] = useState<AssessmentData | null>(null);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [bank, setBank] = useState<QuestionRow[] | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(!assessmentId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState({ type: "all", skill: "", q: "" });

  const load = useCallback(() => {
    if (!assessmentId) return;
    get<AssessmentData>(`/api/assessments/${assessmentId}`).then((d) => {
      setData(d);
      setSelectedIds(d.assessment.items.map((it) => it.question.id));
    }).catch((e) => setError(e.message));
  }, [assessmentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    get<{ courses: { id: string; title: string }[] }>("/api/courses").then((d) => setCourses(d.courses)).catch(() => {});
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (filter.type !== "all") sp.set("type", filter.type);
    if (filter.skill) sp.set("skill", filter.skill);
    if (filter.q.trim()) sp.set("q", filter.q.trim());
    get<{ questions: QuestionRow[] }>(`/api/questions?${sp}`).then((d) => setBank(d.questions)).catch(() => setBank([]));
  }, [filter]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (assessmentId && !data) return <Loader />;

  async function createAssessment(form: {
    title: string; description: string; type: string; courseId: string | null;
    timeLimitMin: number | null; attemptsAllowed: number; passScorePct: number;
  }) {
    try {
      const res = await post<{ assessment: { id: string } }>("/api/assessments", form);
      setShowCreate(false);
      navigate("assessment-builder", res.assessment.id);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  async function saveAll(cfg?: Record<string, unknown>) {
    if (!data) return;
    setSaving(true);
    try {
      await patch(`/api/assessments/${data.assessment.id}`, {
        ...(cfg ?? {}),
        items: selectedIds.map((id) => ({ questionId: id })),
      });
      toast({ title: t("common.saved") });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div>
        <PageHeader title={t("assess.builder")} subtitle={t("assess.newAssessment")} actions={
          <Button variant="outline" size="lg" onClick={() => navigate("assessments")}>
            <ArrowLeft className="me-2 size-4 rtl:rotate-180" aria-hidden />{t("nav.assessments")}
          </Button>
        } />
        {showCreate && <CreateAssessmentDialog courses={courses} onCreate={createAssessment} />}
      </div>
    );
  }

  const a = data.assessment;
  const available = (bank ?? []).filter((q) => q.reviewStatus === "APPROVED");

  return (
    <div>
      <PageHeader
        title={a.title}
        subtitle={`${a.items.length} ${t("assess.questions")} · ${a.status}`}
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => navigate("assessments")}>
              <ArrowLeft className="me-2 size-4 rtl:rotate-180" aria-hidden />{t("nav.assessments")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setPickerOpen(true)}>
              <Plus className="me-2 size-4" aria-hidden />{t("assess.pickQuestions")}
            </Button>
            <Button size="lg" onClick={() => saveAll()} disabled={saving}>
              <Save className="me-2 size-4" aria-hidden />{t("common.save")}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Selected items */}
        <section aria-labelledby="ab-items">
          <h2 id="ab-items" className="mb-3 text-lg font-bold">{t("assess.pickQuestions")} ({selectedIds.length} {t("assess.selected")})</h2>
          {a.items.length === 0 && selectedIds.length === 0 ? (
            <EmptyState title={t("common.empty")} action={<Button onClick={() => setPickerOpen(true)}>{t("assess.pickQuestions")}</Button>} />
          ) : (
            <ol className="space-y-2">
              {selectedIds.map((qid, i) => {
                const q = a.items.find((it) => it.question.id === qid)?.question ?? (bank ?? []).find((b) => b.id === qid);
                if (!q) return null;
                return (
                  <li key={qid} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-medium">{q.stem}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Chip tone="muted">{q.type.replace(/_/g, " ").toLowerCase()}</Chip>
                        <Chip tone="muted">{"●".repeat(q.difficulty)}</Chip>
                        {q.taxonomy && <Chip tone="primary">{q.taxonomy.name}</Chip>}
                      </div>
                    </div>
                    <Button variant="ghost" size="lg" aria-label={`${t("common.delete")}: ${q.stem.slice(0, 40)}`}
                      onClick={() => setSelectedIds(selectedIds.filter((x) => x !== qid))}>
                      ✕
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Blueprint generator */}
          <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="ab-blueprint">
            <h2 id="ab-blueprint" className="flex items-center gap-2 font-semibold"><Wand2 className="size-5 text-primary" aria-hidden />{t("assess.blueprint")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Balanced by difficulty (targets ●2/●3/●4 mix) across the currently filtered pool — {available.length} approved questions available.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[5, 10, 15].map((n) => (
                <Button key={n} variant="outline" size="lg"
                  onClick={() => {
                    const picked = blueprint(available, n, filter.skill);
                    setSelectedIds(picked.map((q) => q.id));
                    toast({ title: `${picked.length} ${t("assess.questions")}` });
                  }}>
                  {n} {t("assess.questions")}
                </Button>
              ))}
            </div>
          </section>
        </section>

        {/* Settings */}
        <aside className="rounded-2xl border border-border bg-card p-4" aria-labelledby="ab-settings">
          <h2 id="ab-settings" className="mb-3 text-lg font-bold">{t("assess.settings")}</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="as-title">{t("qbank.stem").replace("Question stem", "Title")}</Label>
              <Input id="as-title" className="mt-1 min-h-11 text-base" defaultValue={a.title}
                onBlur={(e) => saveAll({ title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="as-desc">{t("courses.description")}</Label>
              <Textarea id="as-desc" rows={2} className="mt-1 text-base" defaultValue={a.description}
                onBlur={(e) => saveAll({ description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="as-type">{t("qbank.type")}</Label>
                <select id="as-type" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                  defaultValue={a.type} onChange={(e) => saveAll({ type: e.target.value })}>
                  {["QUIZ", "EXAM", "PRACTICE_SET", "MOCK", "DIAGNOSTIC"].map((ty) => (
                    <option key={ty} value={ty}>{t(`assess.type.${ty.toLowerCase().replace(" ", "_")}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="as-course">{t("grades.course")}</Label>
                <select id="as-course" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                  defaultValue={a.courseId ?? ""} onChange={(e) => saveAll({ courseId: e.target.value || null })}>
                  <option value="">—</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="as-time">{t("common.minutes")}</Label>
                <Input id="as-time" type="number" min={1} max={600} className="mt-1 min-h-11 text-base" defaultValue={a.timeLimitMin ?? ""}
                  onBlur={(e) => saveAll({ timeLimitMin: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <Label htmlFor="as-attempts">{t("assess.attempts")}</Label>
                <Input id="as-attempts" type="number" min={1} max={99} className="mt-1 min-h-11 text-base" defaultValue={a.attemptsAllowed}
                  onBlur={(e) => saveAll({ attemptsAllowed: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="as-pass">{t("assess.passScore", { pct: "" })}</Label>
                <Input id="as-pass" type="number" min={0} max={100} className="mt-1 min-h-11 text-base" defaultValue={a.passScorePct}
                  onBlur={(e) => saveAll({ passScorePct: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="as-status">{t("common.status")}</Label>
                <select id="as-status" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                  defaultValue={a.status} onChange={(e) => saveAll({ status: e.target.value })}>
                  <option value="DRAFT">{t("qbank.draft")}</option>
                  <option value="PUBLISHED">{t("qbank.approved")}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="as-shuffle">{t("assess.questionNavigator")} shuffle</Label>
              <Switch id="as-shuffle" defaultChecked={a.shuffleQuestions} onCheckedChange={(v) => saveAll({ shuffleQuestions: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="as-soption">Shuffle options</Label>
              <Switch id="as-soption" defaultChecked={a.shuffleOptions} onCheckedChange={(v) => saveAll({ shuffleOptions: v })} />
            </div>
          </div>
        </aside>
      </div>

      {/* Question picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("assess.pickQuestions")}</DialogTitle>
            <DialogDescription>{selectedIds.length} {t("assess.selected")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input placeholder={t("common.search")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} aria-label={t("common.search")} />
            <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-base" value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })} aria-label={t("qbank.type")}>
              <option value="all">{t("common.all")}</option>
              {["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "NUMERIC", "ESSAY", "MATCHING", "ORDERING", "FILL_BLANK"].map((ty) => (
                <option key={ty} value={ty}>{ty.replace(/_/g, " ").toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div className="max-h-[50vh] overflow-y-auto scroll-list !max-h-[50vh]">
            {bank === null ? (
              <p className="py-8 text-center text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <ul className="space-y-2">
                {available.map((q) => {
                  const sel = selectedIds.includes(q.id);
                  return (
                    <li key={q.id}>
                      <button
                        type="button"
                        aria-pressed={sel}
                        onClick={() => setSelectedIds(sel ? selectedIds.filter((x) => x !== q.id) : [...selectedIds, q.id])}
                        className={cn("flex w-full items-start gap-3 rounded-xl border-2 p-3 text-start", sel ? "border-primary bg-primary/5" : "border-border bg-card")}
                      >
                        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2", sel ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                          {sel && <CheckCircle2 className="size-4" aria-hidden />}
                        </span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 block font-medium">{q.stem}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            <Chip tone="muted">{q.type.replace(/_/g, " ").toLowerCase()}</Chip>
                            <Chip tone="muted">{"●".repeat(q.difficulty)}</Chip>
                            {q.taxonomy && <Chip tone="primary">{q.taxonomy.name}</Chip>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>{t("common.close")}</Button>
            <Button onClick={() => { setPickerOpen(false); saveAll(); }}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCreate && !assessmentId && (
        <CreateAssessmentDialog courses={courses} onCreate={createAssessment} />
      )}
    </div>
  );
}

/** Balanced blueprint: mix difficulties, prefer skill match, spread types. */
function blueprint(pool: QuestionRow[], n: number, skillId: string): QuestionRow[] {
  const skillPool = skillId ? pool.filter((q) => q.taxonomy?.id === skillId) : pool;
  const source = skillPool.length >= n ? skillPool : pool;
  const byDiff = { easy: source.filter((q) => q.difficulty <= 2), mid: source.filter((q) => q.difficulty === 3), hard: source.filter((q) => q.difficulty >= 4) };
  const target = { easy: Math.round(n * 0.3), mid: Math.round(n * 0.45), hard: n - Math.round(n * 0.3) - Math.round(n * 0.45) };
  const picked: QuestionRow[] = [];
  const push = (list: QuestionRow[], count: number) => {
    for (let i = 0; i < count && list.length > 0; i++) {
      const idx = Math.floor(Math.random() * list.length);
      picked.push(list.splice(idx, 1)[0]);
    }
  };
  push(byDiff.easy, target.easy);
  push(byDiff.mid, target.mid);
  push(byDiff.hard, target.hard);
  if (picked.length < n) push(source.filter((q) => !picked.includes(q)), n - picked.length);
  return picked.slice(0, n);
}

function CreateAssessmentDialog({ courses, onCreate }: {
  courses: { id: string; title: string }[];
  onCreate: (f: { title: string; description: string; type: string; courseId: string | null; timeLimitMin: number | null; attemptsAllowed: number; passScorePct: number }) => void;
}) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({
    title: "", description: "", type: "QUIZ", courseId: "", timeLimitMin: 20, attemptsAllowed: 2, passScorePct: 60,
  });

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("assess.newAssessment")}</DialogTitle>
          <DialogDescription>{t("assess.builder")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onCreate({ ...form, timeLimitMin: form.timeLimitMin || null, courseId: form.courseId || null }); }} className="space-y-4">
          <div>
            <Label htmlFor="ca-title">{t("announcements.newTitle")}</Label>
            <Input id="ca-title" required minLength={3} className="mt-1 min-h-11 text-base" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ca-type">{t("qbank.type")}</Label>
              <select id="ca-type" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {["QUIZ", "EXAM", "PRACTICE_SET", "MOCK", "DIAGNOSTIC"].map((ty) => (
                  <option key={ty} value={ty}>{t(`assess.type.${ty.toLowerCase().replace(" ", "_")}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ca-course">{t("grades.course")}</Label>
              <select id="ca-course" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
                <option value="">—</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="ca-time">{t("common.minutes")}</Label>
              <Input id="ca-time" type="number" min={0} className="mt-1 min-h-11 text-base" value={form.timeLimitMin ?? ""}
                onChange={(e) => setForm({ ...form, timeLimitMin: Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="ca-attempt">{t("assess.attempts")}</Label>
              <Input id="ca-attempt" type="number" min={1} max={99} className="mt-1 min-h-11 text-base" value={form.attemptsAllowed}
                onChange={(e) => setForm({ ...form, attemptsAllowed: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">{t("common.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
