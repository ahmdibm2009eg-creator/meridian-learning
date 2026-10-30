"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, navigate, speak, stopSpeaking } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, Markdown } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Volume2, Square, ArrowLeft, ArrowRight } from "lucide-react";

interface LessonData {
  lesson: {
    id: string; title: string; type: string; content: string; objectives: string[];
    durationMin: number; courseId: string; courseTitle: string; sectionId: string; sectionTitle: string;
    prev: { id: string; title: string } | null;
    next: { id: string; title: string } | null;
  };
  completed?: boolean;
}

export function LessonView({ lessonId }: { lessonId: string }) {
  const { t, locale } = useApp();
  const [data, setData] = useState<LessonData | null>(null);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readSeconds, setReadSeconds] = useState(0);
  const enteredAt = useRef(Date.now());

  const load = useCallback(() => {
    get<LessonData>(`/api/lessons/${lessonId}`).then((d) => { setData(d); setCompleted(!!d.completed); }).catch((e) => setError(e.message));
  }, [lessonId]);

  useEffect(() => { load(); enteredAt.current = Date.now(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setReadSeconds(Math.round((Date.now() - enteredAt.current) / 1000)), 5000);
    return () => clearInterval(timer);
  }, [lessonId]);

  useEffect(() => () => stopSpeaking(), [lessonId]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!data) return <Loader />;

  const l = data.lesson;

  function toggleSpeak() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    const ok = speak(l.content.replace(/[#*`>|]/g, " "), locale);
    if (!ok) { toast({ title: t("a11y.tts") }); return; }
    setSpeaking(true);
  }

  async function markComplete() {
    try {
      const mins = Math.max(1, Math.round(readSeconds / 60));
      await post(`/api/lessons/${lessonId}/complete`, { timeSpentMin: mins });
      setCompleted(true);
      toast({ title: t("courses.lessonCompleted") });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  return (
    <article className="mx-auto max-w-full">
      <PageHeader
        title={l.title}
        subtitle={`${l.courseTitle} · ${l.sectionTitle} · ${t("lesson.duration", { min: l.durationMin })}`}
        actions={
          <>
            <Button variant="outline" size="lg" onClick={() => navigate("course", l.courseId)}>
              <ArrowLeft className="me-1 size-4 rtl:rotate-180" aria-hidden /> {l.courseTitle}
            </Button>
            <Button variant="outline" size="lg" onClick={toggleSpeak} aria-pressed={speaking}>
              {speaking ? <Square className="me-2 size-4" aria-hidden /> : <Volume2 className="me-2 size-4" aria-hidden />}
              {speaking ? t("lesson.stopListen") : t("lesson.listen")}
            </Button>
          </>
        }
      />

      <div className="reading-measure">
        {l.objectives.length > 0 && (
          <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-label={t("lesson.objectives")}>
            <h2 className="mb-2 font-semibold text-primary">{t("lesson.objectives")}</h2>
            <ul className="list-disc space-y-1 ps-5">
              {l.objectives.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </section>
        )}

        <Markdown text={l.content} className="prose" />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          {l.prev ? (
            <Button variant="outline" size="lg" onClick={() => navigate("lesson", l.prev!.id)}>
              <ArrowLeft className="me-2 size-4 rtl:rotate-180" aria-hidden />
              {t("lesson.prevLesson")}
            </Button>
          ) : <span />}

          {completed ? (
            <span className="flex items-center gap-2 rounded-xl border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 font-semibold text-[var(--success)]">
              <CheckCircle2 className="size-5" aria-hidden /> {t("courses.completed")}
            </span>
          ) : (
            <Button size="lg" onClick={markComplete}>{t("courses.markComplete")}</Button>
          )}

          {l.next ? (
            <Button variant="outline" size="lg" onClick={() => navigate("lesson", l.next!.id)}>
              {t("lesson.nextLesson")}
              <ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden />
            </Button>
          ) : <span />}
        </div>
      </div>
    </article>
  );
}
