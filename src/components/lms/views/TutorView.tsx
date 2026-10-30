"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { get, post, del } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, Chip } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Send, Trash2, MessagesSquare, Lightbulb, GraduationCap, BookOpen, Compass } from "lucide-react";

interface Msg { id: string; role: string; mode: string; content: string; createdAt: string }
type Mode = "HINT" | "SOCRATIC" | "EXPLAIN" | "PLAN";

export function TutorView() {
  const { t, organization } = useApp();
  const [history, setHistory] = useState<Msg[] | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("SOCRATIC");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    get<{ history: Msg[] }>("/api/tutor").then((d) => setHistory(d.history)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history?.length, busy]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!history) return <Loader />;

  const disabled = organization && !organization.aiTutorEnabled;

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    const optimistic: Msg = { id: `tmp-${Date.now()}`, role: "user", mode, content: message, createdAt: new Date().toISOString() };
    setHistory((h) => [...(h ?? []), optimistic]);
    try {
      const data = await post<{ reply: string }>("/api/tutor", { message, mode });
      setHistory((h) => [...(h ?? []), { id: `a-${Date.now()}`, role: "assistant", mode, content: data.reply, createdAt: new Date().toISOString() }]);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
      setHistory((h) => (h ?? []).filter((m) => m.id !== optimistic.id));
      setInput(message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await del("/api/tutor").catch(() => {});
    setHistory([]);
  }

  const modes: { id: Mode; labelKey: string; icon: React.ReactNode }[] = [
    { id: "HINT", labelKey: "tutor.mode.hint", icon: <Lightbulb className="size-4" aria-hidden /> },
    { id: "SOCRATIC", labelKey: "tutor.mode.socratic", icon: <GraduationCap className="size-4" aria-hidden /> },
    { id: "EXPLAIN", labelKey: "tutor.mode.explain", icon: <BookOpen className="size-4" aria-hidden /> },
    { id: "PLAN", labelKey: "tutor.mode.plan", icon: <Compass className="size-4" aria-hidden /> },
  ];

  return (
    <div className="flex min-h-[70vh] flex-col">
      <PageHeader
        title={t("tutor.title")}
        subtitle={t("tutor.subtitle")}
        actions={history.length > 0 && <Button variant="outline" size="lg" onClick={clear}><Trash2 className="me-2 size-4" aria-hidden />{t("tutor.clear")}</Button>}
      />

      {disabled ? (
        <div className="rounded-xl border-2 border-[var(--warning)]/40 bg-[var(--warning)]/10 p-6 text-center text-lg font-semibold text-[var(--warning)]" role="status">
          {t("tutor.disabled")}
        </div>
      ) : (
        <>
          {/* Mode selector */}
          <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t("tutor.mode")}>
            {modes.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-semibold",
                  mode === m.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"
                )}
              >
                {m.icon}
                {t(m.labelKey)}
              </button>
            ))}
            {mode === "HINT" && <Chip tone="primary">{t("tutor.hintNotice")}</Chip>}
          </div>

          {/* Conversation */}
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 sm:p-5" aria-live="polite" aria-label={t("tutor.history")}>
            {history.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                <MessagesSquare className="mx-auto mb-3 size-10" aria-hidden />
                <p className="text-lg font-semibold">{t("tutor.subtitle")}</p>
                <p className="mt-1">{t("tutor.placeholder")}</p>
              </div>
            )}
            {history.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed sm:max-w-[75%]",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-muted/50"
                )}>
                  {m.role === "assistant" && (
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">{t(`tutor.mode.${m.mode.toLowerCase()}`)}</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {busy && <p className="text-muted-foreground" role="status">{t("common.loading")}</p>}
            <div ref={endRef} />
          </div>

          {history.some((m) => m.role === "assistant") && (
            <p className="mt-2 text-xs text-muted-foreground" data-decorative>⚠ {t("tutor.disclaimer")}</p>
          )}

          {/* Input */}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <Label htmlFor="tutor-input" className="sr-only">{t("tutor.placeholder")}</Label>
            <Textarea
              id="tutor-input"
              rows={2}
              className="min-h-11 flex-1 text-base"
              placeholder={t("tutor.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={busy}
            />
            <Button type="submit" size="lg" className="min-h-11 px-6 text-lg" disabled={busy || !input.trim()}>
              <Send className="size-5" aria-hidden />
              <span className="ms-1 hidden sm:inline">{t("tutor.send")}</span>
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
