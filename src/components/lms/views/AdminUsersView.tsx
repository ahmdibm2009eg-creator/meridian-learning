"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { get, post, patch } from "@/lib/api-client";
import { PageHeader, Loader, ErrorNotice, EmptyState, Chip } from "@/components/lms/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, ShieldOff, ShieldCheck } from "lucide-react";

interface UserRow {
  id: string; name: string; email: string; role: string; suspended: boolean; createdAt: string;
  organizationId: string | null; organization: { name: string } | null;
}

export function AdminUsersView() {
  const { t, locale, user: me } = useApp();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const localeTag = locale === "ar" ? "ar" : "en";

  const load = useCallback(() => {
    get<{ users: UserRow[] }>("/api/admin/users").then((d) => setRows(d.users)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={load} />;
  if (!rows) return <Loader />;

  const filtered = roleFilter === "all" ? rows : rows.filter((r) => r.role === roleFilter);

  async function toggleSuspend(row: UserRow) {
    try {
      await patch(`/api/admin/users/${row.id}`, { suspended: !row.suspended });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  async function changeRole(row: UserRow, role: string) {
    try {
      await patch(`/api/admin/users/${row.id}`, { role });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    }
  }

  return (
    <div>
      <PageHeader
        title={t("admin.users")}
        subtitle={t("admin.demoWarning")}
        actions={<Button size="lg" onClick={() => setShowNew(true)}><Plus className="me-2 size-5" aria-hidden />{t("admin.addUser")}</Button>}
      />

      <div className="mb-4 flex items-center gap-3">
        <Label htmlFor="uf-role" className="text-sm">{t("common.role")}</Label>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger id="uf-role" className="w-48 min-h-11 text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")} ({rows.length})</SelectItem>
            {["ORG_ADMIN", "TEACHER", "AUTHOR", "STUDENT", "PARENT"].map((r) => (
              <SelectItem key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()} ({rows.filter((x) => x.role === r).length})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("common.noResults")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("admin.users")}</caption>
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.name")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.email")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.role")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.status")}</th>
                <th scope="col" className="p-3 text-start font-semibold">{t("common.date")}</th>
                <th scope="col" className="p-3 text-end font-semibold">{t("common.edit")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{row.name}</td>
                  <td className="p-3 text-muted-foreground">{row.email}</td>
                  <td className="p-3">
                    {row.id === me?.id ? (
                      <span className="text-sm">{row.role.replace(/_/g, " ").toLowerCase()}</span>
                    ) : (
                      <select
                        aria-label={`${t("common.role")}: ${row.name}`}
                        className="min-h-9 rounded-lg border border-input bg-card px-2 text-sm"
                        value={row.role}
                        onChange={(e) => changeRole(row, e.target.value)}
                      >
                        {["ORG_ADMIN", "TEACHER", "AUTHOR", "STUDENT", "PARENT"].map((r) => (
                          <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-3">
                    {row.suspended ? (
                      <Chip tone="danger">{t("admin.suspended")}</Chip>
                    ) : (
                      <Chip tone="success">{t("admin.active")}</Chip>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground tabular-nums">
                    {new Date(row.createdAt).toLocaleDateString(localeTag, { year: "numeric", month: "short" })}
                  </td>
                  <td className="p-3 text-end">
                    {row.id !== me?.id && (
                      <Button variant={row.suspended ? "outline" : "ghost"} size="lg"
                        onClick={() => toggleSuspend(row)}
                        aria-label={`${row.suspended ? t("admin.reactivate") : t("admin.suspend")}: ${row.name}`}>
                        {row.suspended ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldOff className="size-4 text-destructive" aria-hidden />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewUserDialog onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useApp((s) => s.t);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STUDENT" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/admin/users", form);
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
        <DialogHeader>
          <DialogTitle>{t("admin.addUser")}</DialogTitle>
          <DialogDescription>{t("admin.demoWarning")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="nu-name">{t("common.name")}</Label>
            <Input id="nu-name" required className="mt-1 min-h-11 text-base" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="nu-email">{t("common.email")}</Label>
            <Input id="nu-email" type="email" required className="mt-1 min-h-11 text-base" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="nu-pass">{t("common.password")}</Label>
            <Input id="nu-pass" type="text" required minLength={8} className="mt-1 min-h-11 font-mono text-base" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="nu-role">{t("common.role")}</Label>
            <select id="nu-role" className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {["ORG_ADMIN", "TEACHER", "AUTHOR", "STUDENT", "PARENT"].map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>
              ))}
            </select>
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
