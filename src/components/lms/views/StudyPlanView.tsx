"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post, patch } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip, StatCard, ProgressBar } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CalendarCheck, CheckCircle2, HelpCircle, Zap, Target, CalendarDays } from "lucide-react";

interface PlanData {
  plan: {
    id: string; goalExam: string; examDate: string; targetScore: number; weeklyHours: number;
    tasks: { id: string; dueDate: string; title: string; description: string; type: string; status: string; reason: string; estimatedMin: number; taxonomyNodeId: string | null }[];
  } | null;
  dueMistakes: number;
}

export function StudyPlanView() {
  const { t, locale } = useApp();
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState("");
  const [showGen, setShowGen] = useState(false);
  const localeTag = locale === "ar" ? "ar" : "en";

  const load = useCallback(() => {
    get<PlanData>("/api/study-plan").then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!data) return <Loader />;

  const plan = data.plan;
  const daysLeft = plan ? Math.max(0, Math.ceil((new Date(plan.examDate).getTime() - Date.now()) / 864e5)) : 0;
  const done = plan?.tasks.filter((x) => x.status === "DONE") ?? [];
  const pending = plan?.tasks.filter((x) => x.status === "PENDING") ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);

  const today = pending.filter((x) => x.dueDate.slice(0, 10) === todayStr);
  const thisWeek = pending.filter((x) => x.dueDate.slice(0, 10) > todayStr && new Date(x.dueDate).getTime() < Date.now() + 7 * 864e5);
  const later = pending.filter((x) => new Date(x.dueDate).getTime() >= Date.now() + 7 * 864e5);

  async function setTask(id: string, status: string) {
    await patch(`/api/study-tasks/${id}`, { status }).catch(() => {});
    load();
  }

  async function generate(form: { goalExam: string; examDate: string; targetScore: number; weeklyHours: number }) {
    try {
      await post("/api/study-plan", form);
      toast({ title: t("common.saved") });
      setShowGen(false);
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  function TaskCard({ task }: { task: NonNullable<PlanData["plan"]>["tasks"][number] }) {
    const overdue = new Date(task.dueDate).getTime() < Date.now() && task.status === "PENDING";
    return (
      <li className={cn("rounded-xl border p-4", overdue ? "border-[var(--warning)]/50 bg-[var(--warning)]/5" : "border-border bg-card")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="primary">{typeText(task.type, t)}</Chip>
              {overdue && <Chip tone="warning">{t("plan.overdue")}</Chip>}
              <span className="text-xs text-muted-foreground tabular-nums">
                {new Date(task.dueDate).toLocaleDateString(localeTag, { weekday: "short", month: "short", day: "numeric" })} · {task.estimatedMin} min
              </span>
            </div>
            <p className="mt-1 font-semibold">{task.title}</p>
            {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
            {task.reason && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-primary">
                  <HelpCircle className="me-1 inline size-3.5" aria-hidden />{t("plan.why")}
                </summary>
                <p className="mt-1 rounded-lg bg-muted p-2 text-sm">{task.reason}</p>
              </details>
            )}
          </div>
          {task.status === "PENDING" && (
            <Button variant="outline" size="lg" className="shrink-0" onClick={() => setTask(task.id, "DONE")} aria-label={`${t("plan.markDone")}: ${task.title}`}>
              <CheckCircle2 className="size-5" aria-hidden />
            </Button>
          )}
        </div>
        {task.status === "DONE" && <Chip tone="success" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>{t("plan.completed")}</Chip>}
      </li>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("plan.title")}
        subtitle={t("plan.subtitle")}
        actions={
          <>
            {plan && <Button size="lg" variant="outline" onClick={() => setShowGen(true)}>{t("plan.regenerate")}</Button>}
            {!plan && <Button size="lg" onClick={() => setShowGen(true)}><CalendarCheck className="me-2 size-5" aria-hidden />{t("plan.generate")}</Button>}
          </>
        }
      />

      {!plan ? (
        <EmptyState title={t("plan.noPlan")} icon={<CalendarDays className="size-8 text-primary" aria-hidden />}
          action={<Button size="lg" onClick={() => setShowGen(true)}>{t("plan.generate")}</Button>} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t("plan.goalExam")} value={plan.goalExam} icon={<Target className="size-5" aria-hidden />} />
            <StatCard label={t("plan.examDate")} value={new Date(plan.examDate).toLocaleDateString(localeTag, { month: "short", day: "numeric" })} hint={`${daysLeft} ${t("dash.days")}`} />
            <StatCard label={t("plan.target")} value={plan.targetScore} />
            <StatCard label={t("plan.weeklyHours")} value={`${plan.weeklyHours} h`} />
          </div>

          <div className="mb-6 rounded-xl border border-border bg-card p-4" aria-label={t("dash.progress")}>
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{done.length}/{done.length + pending.length} {t("plan.completed").toLowerCase()}</span>
              <span className="text-muted-foreground">{data.dueMistakes} {t("mistakes.due").toLowerCase()}</span>
            </div>
            <ProgressBar pct={(done.length / Math.max(1, done.length + pending.length)) * 100} />
          </div>

          <div className="space-y-8">
            {today.length > 0 && (
              <section aria-labelledby="h-today">
                <h2 id="h-today" className="mb-3 flex items-center gap-2 text-xl font-bold"><Zap className="size-5 text-primary" aria-hidden />{t("plan.today")}</h2>
                <ul className="space-y-3">{today.map((task) => <TaskCard key={task.id} task={task} />)}</ul>
              </section>
            )}
            {thisWeek.length > 0 && (
              <section aria-labelledby="h-week">
                <h2 id="h-week" className="mb-3 text-xl font-bold">{t("plan.thisWeek")}</h2>
                <ul className="space-y-3">{thisWeek.map((task) => <TaskCard key={task.id} task={task} />)}</ul>
              </section>
            )}
            {later.length > 0 && (
              <section aria-labelledby="h-later">
                <h2 id="h-later" className="mb-3 text-xl font-bold">{t("plan.later")}</h2>
                <ul className="space-y-3">{later.map((task) => <TaskCard key={task.id} task={task} />)}</ul>
              </section>
            )}
            {done.length > 0 && (
              <section aria-labelledby="h-done">
                <h2 id="h-done" className="mb-3 text-xl font-bold text-muted-foreground">{t("plan.completed")}</h2>
                <ul className="space-y-3 opacity-75">{done.slice(-6).map((task) => <TaskCard key={task.id} task={task} />)}</ul>
              </section>
            )}
          </div>
        </>
      )}

      {showGen && <GenerateDialog onClose={() => setShowGen(false)} onGenerate={generate} plan={plan} />}
    </div>
  );
}

function typeText(ty: string, t: (k: string) => string) {
  const map: Record<string, string> = { PRACTICE: "practice.title", REVIEW: "common.review", VOCAB: "vocab.title", MOCK: "assess.type.mock", LESSON: "courses.lessons", REST: "plan.later" };
  return t(map[ty] ?? ty);
}

function GenerateDialog({ onClose, onGenerate, plan }: {
  onClose: () => void;
  onGenerate: (f: { goalExam: string; examDate: string; targetScore: number; weeklyHours: number }) => void;
  plan: PlanData["plan"];
}) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({
    goalExam: plan?.goalExam ?? "SAT",
    examDate: plan ? new Date(plan.examDate).toISOString().slice(0, 10) : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    targetScore: plan?.targetScore ?? 1200,
    weeklyHours: plan?.weeklyHours ?? 8,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plan.generate")}</DialogTitle>
          <DialogDescription>{t("plan.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onGenerate(form); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="g-exam">{t("plan.goalExam")}</Label>
              <Input id="g-exam" className="mt-1 min-h-11" list="exam-list" value={form.goalExam} onChange={(e) => setForm({ ...form, goalExam: e.target.value })} />
              <datalist id="exam-list">
                <option value="SAT" /><option value="ACT" /><option value="AP" /><option value="GCSE" /><option value="Final exam" />
              </datalist>
            </div>
            <div>
              <Label htmlFor="g-date">{t("plan.examDate")}</Label>
              <Input id="g-date" type="date" required className="mt-1 min-h-11" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="g-target">{t("plan.target")}</Label>
              <Input id="g-target" type="number" min={200} max={1600} className="mt-1 min-h-11" value={form.targetScore} onChange={(e) => setForm({ ...form, targetScore: Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="g-hours">{t("plan.weeklyHours")}</Label>
              <Input id="g-hours" type="number" min={1} max={40} className="mt-1 min-h-11" value={form.weeklyHours} onChange={(e) => setForm({ ...form, weeklyHours: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit">{t("plan.generate")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
