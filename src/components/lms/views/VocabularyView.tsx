"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip, StatCard, ProgressBar } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { speak } from "@/lib/store";
import { GraduationCap, Volume2, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

interface VocabData {
  cards: {
    progressId: string; box: number; status: string;
    item: { id: string; word: string; cefr: string; partOfSpeech: string; definition: string; arabicMeaning: string; example: string; synonyms: string[] };
  }[];
  stats: { total: number; known: number; uncertain: number; due: number };
}

export function VocabularyView() {
  const { t, locale } = useApp();
  const [data, setData] = useState<VocabData | null>(null);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [finished, setFinished] = useState(false);

  const load = useCallback(() => {
    get<VocabData>("/api/vocab?limit=15").then((d) => { setData(d); setIdx(0); setRevealed(false); setFinished(d.cards.length === 0); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!data) return <Loader />;

  const card = data.cards[idx];

  async function review(outcome: "known" | "uncertain" | "unknown") {
    if (!card || !data) return;
    try {
      await post("/api/vocab", { progressId: card.progressId, outcome });
      const next = idx + 1;
      setReviewed((r) => r + 1);
      if (next >= data.cards.length) {
        setFinished(true);
      } else {
        setIdx(next);
        setRevealed(false);
      }
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  const knownPct = data.stats.total ? Math.round((data.stats.known / data.stats.total) * 100) : 0;

  return (
    <div>
      <PageHeader title={t("vocab.title")} subtitle={t("vocab.subtitle")} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label={t("vocab.due")} value={data.stats.due} />
        <StatCard label={t("vocab.progress")} value={<span>{data.stats.known}/{data.stats.total}</span>} hint={`${knownPct}%`} />
        <StatCard label="CEFR B1–C1" value={`${data.stats.total} words`} />
      </div>

      {finished ? (
        <EmptyState
          title={t("vocab.sessionDone", { n: reviewed })}
          icon={<GraduationCap className="size-8 text-primary" aria-hidden />}
          action={<Button size="lg" onClick={load}>{t("practice.start")}</Button>}
        />
      ) : !card ? (
        <EmptyState title={t("vocab.noCards")} icon={<GraduationCap className="size-8 text-primary" aria-hidden />} />
      ) : (
        <div className="mx-auto max-w-xl">
          {/* Card */}
          <article className="rounded-2xl border-2 border-border bg-card p-8 text-center shadow-sm" aria-label={t("vocab.title")}>
            <div className="mb-3 flex items-center justify-center gap-2">
              <Chip tone="muted">{card.item.cefr}</Chip>
              {card.item.partOfSpeech && <Chip tone="muted">{card.item.partOfSpeech}</Chip>}
              <Chip tone="primary">box {card.box}/5</Chip>
            </div>
            <p className="text-4xl font-bold tracking-wide" lang="en">{card.item.word}</p>
            <Button
              variant="ghost"
              size="lg"
              className="mt-3"
              aria-label={`${t("vocab.listen")}: ${card.item.word}`}
              onClick={() => speak(card.item.word, "en")}
            >
              <Volume2 className="size-5" aria-hidden />
              {t("vocab.listen")}
            </Button>

            {!revealed ? (
              <Button size="lg" className="mt-6 min-w-48 text-lg" onClick={() => setRevealed(true)}>
                {t("vocab.showAnswer")}
              </Button>
            ) : (
              <div className="mt-4 space-y-3" role="region" aria-live="polite">
                <div className="rounded-xl bg-muted p-4 text-start">
                  <p className="text-lg font-semibold" lang="en">{card.item.definition}</p>
                  {card.item.arabicMeaning && (
                    <p className="mt-1 text-xl text-primary" dir="rtl" lang="ar">{card.item.arabicMeaning}</p>
                  )}
                  {card.item.example && (
                    <p className="mt-2 border-t border-border pt-2 text-sm italic text-muted-foreground" lang="en">
                      {t("vocab.example")}: {card.item.example}
                    </p>
                  )}
                  {card.item.synonyms.length > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground" lang="en">
                      {t("vocab.synonyms")}: {card.item.synonyms.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </article>

          {/* Outcome buttons */}
          {revealed && (
            <div className="mt-5 grid gap-2 sm:grid-cols-3" role="group" aria-label={t("practice.selfAssess")}>
              <Button size="lg" variant="outline" className="min-h-16 border-[var(--success)]/50 text-lg" onClick={() => review("known")}>
                <CheckCircle2 className="me-2 size-5 text-[var(--success)]" aria-hidden />
                {t("vocab.known")}
              </Button>
              <Button size="lg" variant="outline" className="min-h-16 border-[var(--warning)]/50 text-lg" onClick={() => review("uncertain")}>
                <HelpCircle className="me-2 size-5 text-[var(--warning)]" aria-hidden />
                {t("vocab.uncertain")}
              </Button>
              <Button size="lg" variant="outline" className="min-h-16 border-destructive/50 text-lg" onClick={() => review("unknown")}>
                <XCircle className="me-2 size-5 text-destructive" aria-hidden />
                {t("vocab.unknown")}
              </Button>
            </div>
          )}

          {/* Session progress */}
          <div className="mt-6">
            <ProgressBar pct={(idx / Math.max(1, data.cards.length)) * 100} label={`${idx + 1}/${data.cards.length}`} />
            <p className="mt-1 text-center text-xs text-muted-foreground tabular-nums">{idx + 1} / {data.cards.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}
