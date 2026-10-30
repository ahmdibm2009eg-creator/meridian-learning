"use client";

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "@/lib/store";
import { Loader2, Inbox, AlertCircle, CheckCircle2, XCircle, Clock, Flag } from "lucide-react";
import type { MasteryEstimate } from "@/lib/types";

// ── Page scaffolding ─────────────────────────────────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground text-base sm:text-lg">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loader({ label }: { label?: string }) {
  const t = useApp((s) => s.t);
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 py-16 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin" aria-hidden />
      <span className="text-base">{label ?? t("common.loading")}</span>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center">
      {icon ?? <Inbox className="size-8 text-muted-foreground" aria-hidden />}
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="max-w-md text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useApp((s) => s.t);
  return (
    <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4" role="alert">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertCircle className="size-5" aria-hidden />
        {message}
      </div>
      {onRetry && (
        <button className="mt-2 rounded-lg border border-border px-3 py-1.5 text-sm underline-offset-4 hover:underline" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

// ── Stat cards ───────────────────────────────────────────────

export function StatCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground" aria-hidden>{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Mastery with uncertainty — never a bare percentage ───────

export function MasteryBar({ m }: { m: MasteryEstimate & { parentName?: string | null } }) {
  const pct = Math.round(m.estimate * 100);
  const lo = Math.round(m.low * 100);
  const hi = Math.round(m.high * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{m.nodeName}{m.parentName ? <span className="text-muted-foreground"> · {m.parentName}</span> : null}</span>
        <span className="tabular-nums text-muted-foreground" aria-hidden>{pct}%</span>
      </div>
      <div
        className="relative h-4 overflow-hidden rounded-md border border-border bg-muted"
        role="img"
        aria-label={`${m.nodeName}: estimated mastery ${pct} percent, credible range ${lo} to ${hi} percent, from ${m.correct + m.incorrect} answers`}
      >
        <div className="absolute inset-y-0 bg-primary/20" style={{ insetInlineStart: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
        <div className="absolute inset-y-0 w-1.5 bg-primary" style={{ insetInlineStart: `calc(${pct}% - 3px)` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {lo}–{hi}% range · {m.correct}/{m.correct + m.incorrect} correct · {m.label}
      </p>
    </div>
  );
}

// ── Status chips (icon + text — never colour alone) ──────────

export function Chip({ tone, children, icon }: { tone: "primary" | "success" | "warning" | "danger" | "muted"; children: React.ReactNode; icon?: React.ReactNode }) {
  const tones: Record<string, string> = {
    primary: "border-primary/40 bg-primary/10 text-primary",
    success: "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]",
    warning: "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]",
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    muted: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function CorrectChip() {
  const t = useApp((s) => s.t);
  return <Chip tone="success" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>{t("practice.correct")}</Chip>;
}
export function IncorrectChip() {
  const t = useApp((s) => s.t);
  return <Chip tone="danger" icon={<XCircle className="size-3.5" aria-hidden />}>{t("practice.incorrect")}</Chip>;
}
export function PartialChip() {
  const t = useApp((s) => s.t);
  return <Chip tone="warning" icon={<AlertCircle className="size-3.5" aria-hidden />}>{t("practice.partiallyCorrect")}</Chip>;
}
export function DueChip({ date }: { date?: string | null }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const due = date ? new Date(date) <= new Date() : true;
  return (
    <Chip tone={due ? "warning" : "muted"} icon={<Clock className="size-3.5" aria-hidden />}>
      {due
        ? t("mistakes.due")
        : t("mistakes.dueOn", { date: new Date(date!).toLocaleDateString(locale === "ar" ? "ar" : "en", { month: "short", day: "numeric" }) })}
    </Chip>
  );
}
export function FlaggedChip() {
  const t = useApp((s) => s.t);
  return <Chip tone="primary" icon={<Flag className="size-3.5" aria-hidden />}>{t("assess.flagged")}</Chip>;
}

// ── Markdown with accessible math spans ──────────────────────

export function Markdown({ text, className }: { text: string; className?: string }) {
  const prepared = (text ?? "")
    .replace(/\\\((.+?)\\\)/g, (_m, inner: string) => "`" + inner + "`")
    .replace(/\\\[(.+?)\\\]/g, (_m, inner: string) => "`" + inner + "`");
  return (
    <div className={cn("prose-lms", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ children }) => <span className="mathspan">{children}</span>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
              {children}
            </a>
          ),
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

// ── Misc ─────────────────────────────────────────────────────

export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div
      className="h-3 overflow-hidden rounded-full border border-border bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${Math.round(pct)}%`}
    >
      <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function difficultyLabel(d: number): string {
  return "●".repeat(Math.max(1, Math.min(5, d))) + "○".repeat(5 - Math.max(1, Math.min(5, d)));
}
