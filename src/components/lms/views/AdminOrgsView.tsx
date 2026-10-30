"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { get, post } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, Chip } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus } from "lucide-react";

interface OrgRow { id: string; name: string; slug: string; brandingColor: string; aiTutorEnabled: boolean; users: number; courses: number; questions: number }

export function AdminOrgsView() {
  const { t } = useApp();
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    get<{ organizations: OrgRow[] }>("/api/admin/orgs").then((d) => setRows(d.organizations)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!rows) return <Loader />;

  return (
    <div>
      <PageHeader
        title={t("admin.orgs")}
        subtitle={`${rows.length} ${t("admin.memberCount")}`}
        actions={<Button size="lg" onClick={() => setShowNew(true)}><Plus className="me-2 size-5" aria-hidden />{t("admin.newOrg")}</Button>}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((o) => (
          <li key={o.id}>
            <article className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl text-lg font-black text-white" style={{ background: o.brandingColor }} aria-hidden>
                  {o.name[0]}
                </span>
                <div>
                  <h2 className="font-bold">{o.name}</h2>
                  <code className="text-xs text-muted-foreground">{o.slug}</code>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                <li>{o.users} {t("admin.memberCount")}</li>
                <li>{o.courses} {t("nav.courses").toLowerCase()} · {o.questions} {t("qbank.title").toLowerCase()}</li>
                <li className="pt-1">
                  <Chip tone={o.aiTutorEnabled ? "success" : "muted"}>{o.aiTutorEnabled ? "AI tutor: on" : "AI tutor: off"}</Chip>
                </li>
              </ul>
            </article>
          </li>
        ))}
      </ul>

      {showNew && <NewOrgDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewOrgDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/admin/orgs", form);
      toast({ title: "✓" });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("admin.newOrg")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="org-name">{t("common.name")}</Label>
            <Input id="org-name" required minLength={2} className="mt-1 min-h-11 text-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="org-slug">Code (a–z, 0–9, -)</Label>
            <Input id="org-slug" required pattern="[a-z0-9-]+" className="mt-1 min-h-11 font-mono text-base" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="springfield-high" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={busy}>{t("common.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
