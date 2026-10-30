"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { get } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip } from "@/components/lms/bits";
import { CalendarDays, Clock, Video, AlertTriangle, Users } from "lucide-react";

interface Event { id: string; title: string; description: string; startAt: string; endAt: string; type: string; courseId: string | null }

export function CalendarView() {
  const { t, locale } = useApp();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  const localeTag = locale === "ar" ? "ar" : "en";

  useEffect(() => {
    get<{ upcoming: Event[] }>("/api/calendar").then((d) => setEvents(d.upcoming)).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNotice message={error} onRetry={() => location.reload()} />;
  if (!events) return <Loader />;

  function iconFor(type: string) {
    switch (type) {
      case "EXAM": return <AlertTriangle className="size-5 text-[var(--warning)]" aria-hidden />;
      case "DEADLINE": return <Clock className="size-5 text-destructive" aria-hidden />;
      case "OFFICE_HOUR": return <Users className="size-5 text-primary" aria-hidden />;
      default: return <Video className="size-5 text-primary" aria-hidden />;
    }
  }

  // Group by date
  const groups = new Map<string, Event[]>();
  for (const e of events) {
    const key = new Date(e.startAt).toISOString().slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  return (
    <div>
      <PageHeader title={t("cal.title")} subtitle={t("cal.upcoming")} />
      {events.length === 0 ? (
        <EmptyState title={t("cal.empty")} icon={<CalendarDays className="size-8 text-muted-foreground" aria-hidden />} />
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([date, list]) => {
            const d = new Date(date + "T00:00:00");
            const isToday = date === new Date().toISOString().slice(0, 10);
            return (
              <section key={date} aria-labelledby={`d-${date}`} className={isToday ? "rounded-2xl border-2 border-primary/40 bg-primary/5 p-4" : ""}>
                <h2 id={`d-${date}`} className="mb-3 text-lg font-bold">
                  {isToday && <Chip tone="primary">{t("common.today")}</Chip>}{" "}
                  {d.toLocaleDateString(localeTag, { weekday: "long", month: "long", day: "numeric" })}
                </h2>
                <ul className="space-y-2">
                  {list.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                      {iconFor(e.type)}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{e.title}</p>
                        {e.description && <p className="mt-0.5 text-sm text-muted-foreground">{e.description}</p>}
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {new Date(e.startAt).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })}
                          {" – "}
                          {new Date(e.endAt).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <Chip tone="muted">{t(`cal.type.${e.type.toLowerCase()}`)}</Chip>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
