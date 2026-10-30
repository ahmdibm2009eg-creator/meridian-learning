"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get } from "@/lib/api-client";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { navForRole } from "@/components/lms/AppShell";
import { LayoutDashboard, BookOpen, Database } from "lucide-react";

interface SearchResults {
  courses: { id: string; title: string }[];
  lessons: { id: string; title: string; courseId: string; courseTitle: string }[];
  questions: { id: string; stem: string; type: string }[];
}

export function CommandPalette() {
  const { paletteOpen, setPalette, t, user } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ courses: [], lessons: [], questions: [] });

  useEffect(() => {
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => {
        get<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`)
          .then(setResults)
          .catch(() => setResults({ courses: [], lessons: [], questions: [] }));
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [query]);

  const empty: SearchResults = { courses: [], lessons: [], questions: [] };
  const active = query.trim().length >= 2 ? results : empty;

  const nav = useMemo(() => navForRole(user?.role ?? "STUDENT"), [user?.role]);

  function go(fn: () => void) {
    setPalette(false);
    setQuery("");
    fn();
  }

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPalette}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t("cmd.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("cmd.noMatches")}</CommandEmpty>

        <CommandGroup heading={t("cmd.pages")}>
          {nav.flatMap((s) => s.items).map((item) => (
            <CommandItem
              key={item.view}
              value={`${t(item.labelKey)} ${item.view}`}
              onSelect={() => go(() => navigate(item.view))}
            >
              {item.icon}
              <span className="ms-2">{t(item.labelKey)}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {active.courses.length > 0 && (
          <CommandGroup heading={t("cmd.courses")}>
            {active.courses.map((c) => (
              <CommandItem key={c.id} value={`course ${c.title}`} onSelect={() => go(() => navigate("course", c.id))}>
                <BookOpen className="size-4" aria-hidden />
                <span className="ms-2">{c.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {active.lessons.length > 0 && (
          <CommandGroup heading="Lessons">
            {active.lessons.map((l) => (
              <CommandItem key={l.id} value={`lesson ${l.title}`} onSelect={() => go(() => navigate("lesson", l.id))}>
                <LayoutDashboard className="size-4" aria-hidden />
                <span className="ms-2">{l.title} <span className="text-xs text-muted-foreground">— {l.courseTitle}</span></span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {active.questions.length > 0 && (
          <CommandGroup heading={t("cmd.questions")}>
            {active.questions.map((q) => (
              <CommandItem key={q.id} value={`question ${q.stem}`} onSelect={() => go(() => navigate("question-bank", q.id))}>
                <Database className="size-4" aria-hidden />
                <span className="ms-2 line-clamp-1">{q.stem}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
