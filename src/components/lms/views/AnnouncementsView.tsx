"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Megaphone } from "lucide-react";

interface Announcement { id: string; title: string; body: string; createdAt: string; courseId: string | null; author: { name: string } | null }

export function AnnouncementsView() {
  const { user, t, locale } = useApp();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const canPost = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "");
  const localeTag = locale === "ar" ? "ar" : "en";

  const load = useCallback(() => {
    get<{ announcements: Announcement[] }>("/api/announcements").then((d) => setItems(d.announcements)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!items) return <Loader />;

  return (
    <div>
      <PageHeader
        title={t("announcements.title")}
        actions={canPost && <Button size="lg" onClick={() => setShowNew(true)}><Megaphone className="me-2 size-5" aria-hidden />{t("announcements.post")}</Button>}
      />
      {items.length === 0 ? (
        <EmptyState title={t("announcements.empty")} />
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-bold">{a.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-base">{a.body}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {a.author?.name ?? "—"} · {new Date(a.createdAt).toLocaleDateString(localeTag, { month: "long", day: "numeric" })}
              </p>
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <NewAnnouncement
          onClose={() => setShowNew(false)}
          onPosted={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

function NewAnnouncement({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const t = useApp((s) => s.t);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [form, setForm] = useState({ title: "", body: "", courseId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    get<{ courses: { id: string; title: string }[] }>("/api/courses").then((d) => setCourses(d.courses));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/announcements", { ...form, courseId: form.courseId || null });
      toast({ title: "✓" });
      onPosted();
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
            <Label htmlFor="na-t">{t("announcements.newTitle")}</Label>
            <Input id="na-t" required minLength={3} className="mt-1 min-h-11 text-base" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="na-b">{t("announcements.body")}</Label>
            <Textarea id="na-b" required minLength={3} rows={5} className="mt-1 text-base" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="na-c">{t("grades.course")} ({t("common.optional")})</Label>
            <select id="na-c" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base" value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              <option value="">—</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={busy}>{t("announcements.post")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
