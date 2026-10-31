"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, post, patch, del } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip } from "@/components/lms/bits";
import { QuestionRenderer } from "@/components/lms/QuestionRenderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Database, Plus, Upload, Search, Pencil, Trash2, Eye, CheckCircle2 } from "lucide-react";

interface QuestionRow {
  id: string; type: string; stem: string; difficulty: number; estimatedSeconds: number;
  points: number; reviewStatus: string; version: number; tags: string[]; createdAt: string;
  taxonomy: { id: string; name: string; level: string; parent: { name: string } | null } | null;
  authorName: string | null;
  answerKey: any; content: any; explanation: string;
  strategies: Record<string, string>; misconceptions: string[];
  taxonomyNodeId: string | null; passageId: string | null;
  usageCount: number; attemptCount: number;
}
interface TaxonomyNode { id: string; name: string; level: string; parentId: string | null; questionCount: number }

const TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "NUMERIC", "ESSAY", "MATCHING", "ORDERING", "FILL_BLANK"] as const;

export function QuestionBankView() {
  const { t } = useApp();
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [nodes, setNodes] = useState<TaxonomyNode[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", type: "all", status: "all", skill: "all" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [editing, setEditing] = useState<QuestionRow | "new" | null>(null);
  const [preview, setPreview] = useState<QuestionRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Paginated load: filter changes reset to page 1; "Load more" appends.
  const load = useCallback((nextPage: number, append: boolean) => {
    const sp = new URLSearchParams();
    if (filters.type !== "all") sp.set("type", filters.type);
    if (filters.status !== "all") sp.set("status", filters.status);
    if (filters.skill !== "all") sp.set("skill", filters.skill);
    if (filters.q.trim()) sp.set("q", filters.q.trim());
    sp.set("page", String(nextPage));
    sp.set("pageSize", "50");
    get<{ questions: QuestionRow[]; total: number; hasMore: boolean }>(`/api/questions?${sp}`)
      .then((d) => {
        setTotal(d.total);
        setRows((prev) => (append && prev ? [...prev, ...d.questions] : d.questions));
        setPage(nextPage);
      })
      .catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => { load(1, false); }, [load]);
  useEffect(() => { get<{ nodes: TaxonomyNode[] }>("/api/taxonomy").then((d) => setNodes(d.nodes)).catch(() => {}); }, []);

  const hasMore = total === null ? false : rows ? rows.length < total : false;

  const skills = useMemo(() => nodes.filter((n) => n.level === "SKILL" || n.level === "SUBSKILL"), [nodes]);

  if (error) return <ErrorNotice message={error} onRetry={() => load(1, false)} />;
  if (!rows) return <Loader />;

  async function remove(row: QuestionRow) {
    if (!confirm(`${t("common.delete")}: ${row.stem.slice(0, 60)}…?`)) return;
    try {
      await del(`/api/questions/${row.id}`);
      toast({ title: t("common.saved") });
      load(1, false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  async function approve(row: QuestionRow) {
    await patch(`/api/questions/${row.id}`, { reviewStatus: "APPROVED" }).catch(() => {});
    load(page, false);
  }

  return (
    <div>
      <PageHeader
        title={t("qbank.title")}
        subtitle={t("qbank.subtitle")}
        actions={
          <>
            <Button size="lg" onClick={() => setImportOpen(true)}><Upload className="me-2 size-5" aria-hidden />{t("qbank.import")}</Button>
            <Button size="lg" onClick={() => setEditing("new")}><Plus className="me-2 size-5" aria-hidden />{t("qbank.newQuestion")}</Button>
          </>
        }
      />

      {/* Filters */}
      <section className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" aria-label={t("practice.filters")}>
        <div className="min-w-52 flex-1">
          <Label htmlFor="qb-q" className="text-sm">{t("common.search")}</Label>
          <div className="relative mt-1">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
            <Input id="qb-q" className="min-h-11 ps-9 text-base" value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="…" />
          </div>
        </div>
        <div className="w-44">
          <Label htmlFor="qb-type" className="text-sm">{t("qbank.type")}</Label>
          <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
            <SelectTrigger id="qb-type" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{ty.replace(/_/g, " ").toLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Label htmlFor="qb-status" className="text-sm">{t("qbank.reviewStatus")}</Label>
          <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
            <SelectTrigger id="qb-status" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="APPROVED">{t("qbank.approved")}</SelectItem>
              <SelectItem value="DRAFT">{t("qbank.draft")}</SelectItem>
              <SelectItem value="IN_REVIEW">{t("qbank.inReview")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Label htmlFor="qb-skill" className="text-sm">{t("practice.skill")}</Label>
          <Select value={filters.skill} onValueChange={(v) => setFilters({ ...filters, skill: v })}>
            <SelectTrigger id="qb-skill" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {skills.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" onClick={() => setFilters({ q: "", type: "all", status: "all", skill: "all" })}>{t("common.clearFilters")}</Button>
      </section>

      <p className="mb-3 text-sm text-muted-foreground" role="status">
        {rows.length}{total !== null && total > rows.length ? ` / ${total}` : ""} {t("common.results")}
      </p>

      {rows.length === 0 ? (
        <EmptyState title={t("practice.noQuestions")} icon={<Database className="size-8 text-muted-foreground" aria-hidden />}
          action={<Button onClick={() => setEditing("new")}>{t("qbank.newQuestion")}</Button>} />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <article className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="muted">{row.type.replace(/_/g, " ").toLowerCase()}</Chip>
                  <Chip tone="muted" aria-label={`difficulty ${row.difficulty}`}>{"●".repeat(row.difficulty)}</Chip>
                  {row.taxonomy && <Chip tone="primary">{row.taxonomy.name}</Chip>}
                  {row.reviewStatus === "APPROVED" ? (
                    <Chip tone="success" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>{t("qbank.approved")}</Chip>
                  ) : row.reviewStatus === "IN_REVIEW" ? (
                    <Chip tone="warning">{t("qbank.inReview")}</Chip>
                  ) : (
                    <Chip tone="muted">{t("qbank.draft")}</Chip>
                  )}
                  <Chip tone="muted">v{row.version}</Chip>
                  <span className="ms-auto flex gap-1">
                    <Button variant="ghost" size="lg" onClick={() => setPreview(row)} aria-label={`${t("qbank.preview")}: ${row.stem.slice(0, 40)}`}>
                      <Eye className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="lg" onClick={() => setEditing(row)} aria-label={`${t("common.edit")}: ${row.stem.slice(0, 40)}`}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    {row.reviewStatus !== "APPROVED" && (
                      <Button variant="ghost" size="lg" onClick={() => approve(row)} aria-label={`${t("qbank.publish")}: ${row.stem.slice(0, 40)}`}>
                        <CheckCircle2 className="size-4 text-[var(--success)]" aria-hidden />
                      </Button>
                    )}
                    <Button variant="ghost" size="lg" onClick={() => remove(row)} aria-label={`${t("common.delete")}: ${row.stem.slice(0, 40)}`}>
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-base">{row.stem}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.estimatedSeconds}s · {row.points} pts · {row.attemptCount} attempts · used in {row.usageCount} assessments
                  {row.authorName ? ` · ${row.authorName}` : ""}
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="lg" onClick={() => load(page + 1, true)}>
            {t("common.loadMore")} ({rows.length}/{total})
          </Button>
        </div>
      )}

      {editing && (
        <QuestionEditorDialog
          question={editing === "new" ? null : editing}
          skills={skills}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(page, false); }}
        />
      )}

      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{t("qbank.preview")}</DialogTitle></DialogHeader>
            <QuestionRenderer
              q={{ ...preview, answerKey: preview.answerKey, explanation: preview.explanation, strategies: preview.strategies, misconceptions: preview.misconceptions }}
              mode="practice"
              value={null}
              feedback={{
                correct: null, awarded: 0, max: preview.points, detail: [],
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); load(1, false); }} />}
    </div>
  );
}

// ── Import dialog ────────────────────────────────────────────

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const t = useApp((s) => s.t);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { imported: number; duplicates: number; flagged: number; total: number }>(null);

  const EXAMPLE = JSON.stringify([
    {
      type: "MCQ_SINGLE",
      stem: "What is 6 × 7?",
      content: { options: [{ id: "a", text: "42" }, { id: "b", text: "36" }, { id: "c", text: "48" }] },
      answerKey: { correct: ["a"] },
      explanation: "6 × 7 = 42.",
      difficulty: 1,
      taxonomyNodeId: null,
    },
  ], null, 2);

  async function run() {
    setBusy(true);
    try {
      const questions = JSON.parse(text);
      const res = await post<{ imported: number; duplicates: number; flagged: number; total: number }>("/api/questions/import", { questions, source: "Manual JSON import" });
      setResult(res);
      onImported();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Invalid JSON", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("qbank.import")}</DialogTitle>
          <DialogDescription>{t("qbank.importHint")}</DialogDescription>
        </DialogHeader>
        <Textarea rows={10} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} aria-label={t("qbank.import")} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setText(EXAMPLE)}>Example</Button>
        </div>
        {result && (
          <p className="rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary" role="status">
            {t("qbank.imported", { n: result.imported, flagged: result.flagged })}
            {result.duplicates > 0 && ` · ${result.duplicates} ${t("qbank.duplicate")}`}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
          <Button onClick={run} disabled={busy || !text.trim()}>{t("qbank.import")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create / edit editor ─────────────────────────────────────

function QuestionEditorDialog({ question, skills, onClose, onSaved }: {
  question: QuestionRow | null;
  skills: TaxonomyNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useApp((s) => s.t);
  const [type, setType] = useState<string>(question?.type ?? "MCQ_SINGLE");
  const [stem, setStem] = useState(question?.stem ?? "");
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 3);
  const [estimatedSeconds, setEstimatedSeconds] = useState(question?.estimatedSeconds ?? 90);
  const [points, setPoints] = useState(question?.points ?? 1);
  const [taxonomyNodeId, setTaxonomyNodeId] = useState(question?.taxonomyNodeId ?? "");
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [strategies, setStrategies] = useState<Record<string, string>>(question?.strategies ?? {});
  const [misconceptions, setMisconceptions] = useState((question?.misconceptions ?? []).join("\n"));
  const [reviewStatus, setReviewStatus] = useState(question?.reviewStatus ?? "DRAFT");

  // Per-type content
  const [options, setOptions] = useState<{ id: string; text: string }[]>(
    (question?.content?.options as { id: string; text: string }[]) ?? [
      { id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }, { id: "d", text: "" },
    ]
  );
  const [correct, setCorrect] = useState<string[]>((question?.answerKey?.correct as string[]) ?? []);
  const [tfCorrect, setTfCorrect] = useState<boolean>(question?.answerKey?.correct ?? true);
  const [accepted, setAccepted] = useState<string[]>((question?.answerKey?.accepted as string[]) ?? []);
  const [numericValue, setNumericValue] = useState<number>(question?.answerKey?.value ?? 0);
  const [tolerance, setTolerance] = useState<number>(question?.answerKey?.tolerance ?? 0);
  const [pairs, setPairs] = useState<{ id: string; left: string; right: string }[]>(
    (question?.content?.pairs as { id: string; left: string; right: string }[]) ?? [
      { id: "a", left: "", right: "" }, { id: "b", left: "", right: "" },
    ]
  );
  const [orderItems, setOrderItems] = useState<{ id: string; text: string }[]>(
    (question?.content?.items as { id: string; text: string }[]) ?? [{ id: "a", text: "" }, { id: "b", text: "" }, { id: "c", text: "" }]
  );
  const [blanks, setBlanks] = useState<Record<string, string[]>>(
    (question?.answerKey?.accepted as Record<string, string[]>) ?? { "1": [] }
  );
  const [rubric, setRubric] = useState<{ criterion: string; points: number }[]>(
    (question?.content?.rubric as { criterion: string; points: number }[]) ?? [{ criterion: "", points: 4 }]
  );
  const [modelAnswer, setModelAnswer] = useState(question?.content?.modelAnswer ?? "");
  const [busy, setBusy] = useState(false);

  const issues = useMemo(() => {
    const list: string[] = [];
    if (!stem.trim()) list.push(t("qbank.missingStem"));
    switch (type) {
      case "MCQ_SINGLE": case "MCQ_MULTI":
        if (options.filter((o) => o.text.trim()).length < 2) list.push(t("qbank.missingOptions"));
        if (correct.length === 0) list.push(t("qbank.missingAnswer"));
        if (type === "MCQ_SINGLE" && correct.length > 1) list.push("Single choice: select exactly one correct option");
        break;
      case "TRUE_FALSE": break;
      case "SHORT_ANSWER":
        if (accepted.filter(Boolean).length === 0) list.push(t("qbank.missingAnswer"));
        break;
      case "NUMERIC": break;
      case "ESSAY": break;
      case "MATCHING":
        if (pairs.filter((p) => p.left.trim() && p.right.trim()).length < 2) list.push("Add at least two complete pairs");
        break;
      case "ORDERING":
        if (orderItems.filter((o) => o.text.trim()).length < 2) list.push("Add at least two items");
        break;
      case "FILL_BLANK":
        if (Object.values(blanks).every((list2) => list2.filter(Boolean).length === 0)) list.push(t("qbank.missingBlanks"));
        if (!/\{\{\d+\}\}/.test(stem)) list.push("Mark blanks in the stem with {{1}}, {{2}}…");
        break;
    }
    return list;
  }, [type, stem, options, correct, accepted, pairs, orderItems, blanks, t]);

  async function save() {
    if (issues.length > 0) return;
    setBusy(true);
    const content: any = {};
    const answerKey: any = {};
    switch (type) {
      case "MCQ_SINGLE": case "MCQ_MULTI":
        content.options = options.filter((o) => o.text.trim());
        answerKey.correct = correct;
        break;
      case "TRUE_FALSE": answerKey.correct = tfCorrect; break;
      case "SHORT_ANSWER": answerKey.accepted = accepted.filter(Boolean); break;
      case "NUMERIC": answerKey.value = numericValue; answerKey.tolerance = tolerance; break;
      case "ESSAY":
        content.rubric = rubric.filter((r) => r.criterion.trim());
        content.modelAnswer = modelAnswer;
        break;
      case "MATCHING": content.pairs = pairs.filter((p) => p.left.trim() && p.right.trim()); break;
      case "ORDERING":
        content.items = orderItems.filter((o) => o.text.trim());
        answerKey.correctOrder = content.items.map((o: { id: string }) => o.id);
        break;
      case "FILL_BLANK":
        content.blanks = Object.keys(blanks).map((id) => ({ id }));
        answerKey.accepted = Object.fromEntries(Object.entries(blanks).map(([k, v]) => [k, v.filter(Boolean)]));
        break;
    }
    const body = {
      type, stem, content, answerKey, explanation,
      strategies: Object.fromEntries(Object.entries(strategies).filter(([, v]) => v?.trim())),
      misconceptions: misconceptions.split("\n").map((s) => s.trim()).filter(Boolean),
      difficulty, estimatedSeconds, points,
      taxonomyNodeId: taxonomyNodeId || null,
      reviewStatus,
    };
    try {
      if (question) {
        await patch(`/api/questions/${question.id}`, body);
      } else {
        await post("/api/questions", body);
      }
      toast({ title: t("common.saved") });
      onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{question ? `${t("common.edit")} — v${question.version}` : t("qbank.newQuestion")}</DialogTitle>
          <DialogDescription>{t("qbank.validation")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="content">
          <TabsList className="mb-3">
            <TabsTrigger value="content">{t("qbank.stem")}</TabsTrigger>
            <TabsTrigger value="key">{t("qbank.answerKey")}</TabsTrigger>
            <TabsTrigger value="meta">{t("qbank.taxonomy")}</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="qe-type">{t("qbank.type")}</Label>
                <Select value={type} onValueChange={setType} disabled={!!question}>
                  <SelectTrigger id="qe-type" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((ty) => <SelectItem key={ty} value={ty}>{ty.replace(/_/g, " ").toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="qe-status">{t("qbank.reviewStatus")}</Label>
                <Select value={reviewStatus} onValueChange={setReviewStatus}>
                  <SelectTrigger id="qe-status" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">{t("qbank.draft")}</SelectItem>
                    <SelectItem value="IN_REVIEW">{t("qbank.inReview")}</SelectItem>
                    <SelectItem value="APPROVED">{t("qbank.approved")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="qe-stem">{t("qbank.stem")}</Label>
              <Textarea id="qe-stem" required rows={4} className="mt-1 text-base" value={stem}
                onChange={(e) => setStem(e.target.value)}
                placeholder={type === "FILL_BLANK" ? "Use {{1}} and {{2}} for blanks…" : "…"} />
            </div>
            {type === "FILL_BLANK" && (
              <p className="text-xs text-muted-foreground">{t("qbank.blanks")}</p>
            )}
          </TabsContent>

          <TabsContent value="key" className="space-y-4">
            {(type === "MCQ_SINGLE" || type === "MCQ_MULTI") && (
              <div>
                <Label className="text-base">{t("qbank.options")}</Label>
                <div className="mt-2 space-y-2">
                  {options.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        role={type === "MCQ_SINGLE" ? "radio" : "checkbox"}
                        aria-checked={correct.includes(o.id)}
                        aria-label={`${t("qbank.correctOptions")}: ${o.text || `option ${i + 1}`}`}
                        onClick={() => {
                          if (type === "MCQ_SINGLE") setCorrect([o.id]);
                          else setCorrect((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : [...c, o.id]));
                        }}
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold ${correct.includes(o.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                      >
                        {String.fromCharCode(65 + i)}
                      </button>
                      <Input className="min-h-11 text-base" value={o.text} aria-label={`Option ${String.fromCharCode(65 + i)}`}
                        onChange={(e) => { const next = [...options]; next[i] = { ...o, text: e.target.value }; setOptions(next); }} />
                      <Button type="button" variant="ghost" onClick={() => setOptions(options.filter((x) => x.id !== o.id))} aria-label={`${t("common.delete")} option ${i + 1}`}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => setOptions([...options, { id: String.fromCharCode(97 + options.length), text: "" }])}>
                  {t("qbank.addOption")}
                </Button>
              </div>
            )}

            {type === "TRUE_FALSE" && (
              <div className="flex gap-2" role="radiogroup" aria-label={t("qbank.answerKey")}>
                {[true, false].map((v) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={tfCorrect === v}
                    onClick={() => setTfCorrect(v)}
                    className={`min-h-11 min-w-28 rounded-xl border-2 px-4 font-semibold ${tfCorrect === v ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                    {String(v)}
                  </button>
                ))}
              </div>
            )}

            {type === "SHORT_ANSWER" && (
              <div>
                <Label htmlFor="qe-acc">{t("qbank.acceptedAnswers")}</Label>
                <Textarea id="qe-acc" rows={3} className="mt-1 text-base" value={accepted.join("\n")}
                  onChange={(e) => setAccepted(e.target.value.split("\n"))} placeholder={"answer\nalt answer"} />
              </div>
            )}

            {type === "NUMERIC" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qe-num">{t("qbank.numericValue")}</Label>
                  <Input id="qe-num" type="number" step="any" className="mt-1 min-h-11 text-base" value={numericValue}
                    onChange={(e) => setNumericValue(Number(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor="qe-tol">{t("qbank.tolerance")}</Label>
                  <Input id="qe-tol" type="number" step="any" min={0} className="mt-1 min-h-11 text-base" value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))} />
                </div>
              </div>
            )}

            {type === "MATCHING" && (
              <div>
                <Label className="text-base">{t("qbank.pairs")}</Label>
                <div className="mt-2 space-y-2">
                  {pairs.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Input className="min-h-11 text-base" value={p.left} placeholder={t("qbank.leftSide")} aria-label={`${t("qbank.leftSide")} ${i + 1}`}
                        onChange={(e) => { const next = [...pairs]; next[i] = { ...p, left: e.target.value }; setPairs(next); }} />
                      <span aria-hidden>→</span>
                      <Input className="min-h-11 text-base" value={p.right} placeholder={t("qbank.rightSide")} aria-label={`${t("qbank.rightSide")} ${i + 1}`}
                        onChange={(e) => { const next = [...pairs]; next[i] = { ...p, right: e.target.value }; setPairs(next); }} />
                      <Button type="button" variant="ghost" onClick={() => setPairs(pairs.filter((x) => x.id !== p.id))} aria-label={`${t("common.delete")} pair ${i + 1}`}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => setPairs([...pairs, { id: String.fromCharCode(97 + pairs.length), left: "", right: "" }])}>
                  {t("qbank.addPair")}
                </Button>
              </div>
            )}

            {type === "ORDERING" && (
              <div>
                <Label className="text-base">{t("qbank.orderItems")}</Label>
                <p className="mb-2 text-xs text-muted-foreground">Top = first step (correct order)</p>
                <div className="space-y-2">
                  {orderItems.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg border-2 border-border text-sm font-bold tabular-nums">{i + 1}</span>
                      <Input className="min-h-11 text-base" value={o.text} aria-label={`Step ${i + 1}`}
                        onChange={(e) => { const next = [...orderItems]; next[i] = { ...o, text: e.target.value }; setOrderItems(next); }} />
                      <Button type="button" variant="ghost" onClick={() => setOrderItems(orderItems.filter((x) => x.id !== o.id))} aria-label={`${t("common.delete")} step ${i + 1}`}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => setOrderItems([...orderItems, { id: String.fromCharCode(97 + orderItems.length), text: "" }])}>
                  {t("qbank.addItem")}
                </Button>
              </div>
            )}

            {type === "FILL_BLANK" && (
              <div>
                <Label className="text-base">{t("qbank.acceptedAnswers")}</Label>
                {Object.keys(blanks).map((id) => (
                  <div key={id} className="mt-2 flex items-center gap-2">
                    <span className="w-14 font-mono font-bold">{`{{${id}}}`}</span>
                    <Input className="min-h-11 text-base" value={blanks[id]?.join(", ") ?? ""}
                      aria-label={`${t("qbank.acceptedAnswers")} {{${id}}}`}
                      onChange={(e) => setBlanks({ ...blanks, [id]: e.target.value.split(",").map((s) => s.trim()) })} />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="mt-2"
                  onClick={() => setBlanks({ ...blanks, [String(Object.keys(blanks).length + 1)]: [] })}>
                  {t("qbank.addItem")}
                </Button>
              </div>
            )}

            {type === "ESSAY" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-base">{t("qbank.rubric")}</Label>
                  {rubric.map((r, i) => (
                    <div key={i} className="mt-2 flex gap-2">
                      <Input className="min-h-11 text-base" value={r.criterion} placeholder={t("courses.objective")}
                        aria-label={`${t("qbank.rubric")} ${i + 1}`}
                        onChange={(e) => { const next = [...rubric]; next[i] = { ...r, criterion: e.target.value }; setRubric(next); }} />
                      <Input type="number" min={0} className="min-h-11 w-24 text-base" value={r.points} aria-label={`${t("common.points")} ${i + 1}`}
                        onChange={(e) => { const next = [...rubric]; next[i] = { ...r, points: Number(e.target.value) }; setRubric(next); }} />
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="mt-2"
                    onClick={() => setRubric([...rubric, { criterion: "", points: 2 }])}>{t("courses.addObjective")}</Button>
                </div>
                <div>
                  <Label htmlFor="qe-model">{t("qbank.modelAnswer")}</Label>
                  <Textarea id="qe-model" rows={4} className="mt-1 text-base" value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="qe-exp">{t("qbank.explanation")}</Label>
              <Textarea id="qe-exp" rows={3} className="mt-1 text-base" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="meta" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="qe-skill">{t("qbank.taxonomy")}</Label>
                <Select value={taxonomyNodeId} onValueChange={setTaxonomyNodeId}>
                  <SelectTrigger id="qe-skill" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="—">—</SelectItem>
                    {skills.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="qe-diff">{t("qbank.difficulty")}</Label>
                <Select value={String(difficulty)} onValueChange={(v) => setDifficulty(Number(v))}>
                  <SelectTrigger id="qe-diff" className="mt-1 min-h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((d) => <SelectItem key={d} value={String(d)}>{"●".repeat(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="qe-est">{t("qbank.estimatedTime")}</Label>
                <Input id="qe-est" type="number" min={10} max={3600} className="mt-1 min-h-11 text-base" value={estimatedSeconds}
                  onChange={(e) => setEstimatedSeconds(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="qe-pts">{t("qbank.points")}</Label>
                <Input id="qe-pts" type="number" min={0.5} step={0.5} className="mt-1 min-h-11 text-base" value={points}
                  onChange={(e) => setPoints(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <Label className="text-base">{t("qbank.strategies")}</Label>
              <div className="mt-2 space-y-2">
                {(["fastest", "standard", "beginner", "alternative", "shortcut"] as const).map((k) => (
                  <div key={k}>
                    <Label htmlFor={`str-${k}`} className="text-xs font-semibold text-muted-foreground">
                      {t(`practice.strategy${k[0].toUpperCase()}${k.slice(1)}`)}
                    </Label>
                    <Textarea id={`str-${k}`} rows={2} className="text-base" value={strategies[k] ?? ""}
                      onChange={(e) => setStrategies({ ...strategies, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="qe-misc">{t("qbank.misconceptions")}</Label>
              <Textarea id="qe-misc" rows={3} className="mt-1 text-base" value={misconceptions}
                onChange={(e) => setMisconceptions(e.target.value)} placeholder={"One per line"} />
            </div>
          </TabsContent>
        </Tabs>

        {issues.length > 0 && (
          <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3" role="alert">
            <p className="font-semibold text-destructive">{t("qbank.fixIssues")}</p>
            <ul className="mt-1 list-disc ps-5 text-sm text-destructive">
              {issues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={busy || issues.length > 0}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
