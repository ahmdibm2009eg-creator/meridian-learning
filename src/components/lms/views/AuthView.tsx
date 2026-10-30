"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { post } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Accessibility, GraduationCap, ShieldCheck, Users } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "student@northfield.edu", roleKey: "auth.student", icon: <GraduationCap className="size-5" aria-hidden /> },
  { email: "teacher@northfield.edu", roleKey: "auth.teacher", icon: <Users className="size-5" aria-hidden /> },
  { email: "admin@northfield.edu", roleKey: "auth.admin", icon: <ShieldCheck className="size-5" aria-hidden /> },
];

export function AuthView({ onAuthed }: { onAuthed: () => void }) {
  const t = useApp((s) => s.t);
  const locale = useApp((s) => s.locale);
  const setLocale = useApp((s) => s.setLocale);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STUDENT", organizationCode: "" });
  const [error, setError] = useState("");

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signin") {
        await post("/api/auth/login", { email: form.email, password: form.password });
      } else {
        await post("/api/auth/register", {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          organizationCode: form.organizationCode || undefined,
        });
      }
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin(email: string) {
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/login", { email, password: "Demo1234!" });
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-xl" aria-hidden>M</div>
          <div>
            <p className="text-lg font-bold">{t("app.name")}</p>
            <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>
          <Accessibility className="me-2 size-4" aria-hidden />
          {locale === "en" ? t("common.arabic") : t("common.english")}
        </Button>
      </div>

      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-4 py-8 lg:grid-cols-2">
        {/* Value panel */}
        <section className="hidden lg:block" data-decorative>
          <h2 className="text-3xl font-bold leading-tight">{t("app.name")}</h2>
          <p className="mt-3 max-w-md text-lg text-muted-foreground">{t("app.tagline")}</p>
          <ul className="mt-6 space-y-3 text-base">
            {[
              "Courses, lessons and live progress tracking",
              "A 9-type question bank with full authoring and review workflow",
              "Exams with autosave, flagging, and elimination tools",
              "A mistake log with spaced-repetition retries",
              "Adaptive study plans that explain every recommendation",
              "Accessibility preferences: text size, contrast, dyslexia font, reading ruler, EN/عربية",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* Auth card */}
        <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as "signin" | "signup"); setError(""); }}>
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="signin" className="text-base">{t("auth.signIn")}</TabsTrigger>
              <TabsTrigger value="signup" className="text-base">{t("auth.signUp")}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={submit} className="space-y-4" noValidate>
                <h1 className="text-xl font-bold">{t("auth.signInTitle")}</h1>
                <p className="text-sm text-muted-foreground">{t("auth.signInSubtitle")}</p>
                <div>
                  <Label htmlFor="email" className="text-base">{t("common.email")}</Label>
                  <Input
                    id="email" type="email" required autoComplete="email" className="mt-1 min-h-11 text-base"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="password" className="text-base">{t("common.password")}</Label>
                  <Input
                    id="password" type="password" required autoComplete="current-password" className="mt-1 min-h-11 text-base"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
                <Button type="submit" className="w-full min-h-11 text-base" disabled={busy}>{t("auth.signIn")}</Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={submit} className="space-y-4" noValidate>
                <h1 className="text-xl font-bold">{t("auth.signUpTitle")}</h1>
                <p className="text-sm text-muted-foreground">{t("auth.signUpSubtitle")}</p>
                <div>
                  <Label htmlFor="name" className="text-base">{t("common.name")}</Label>
                  <Input id="name" required autoComplete="name" className="mt-1 min-h-11 text-base"
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="semail" className="text-base">{t("common.email")}</Label>
                  <Input id="semail" type="email" required autoComplete="email" className="mt-1 min-h-11 text-base"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="spassword" className="text-base">{t("common.password")}</Label>
                  <Input id="spassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1 min-h-11 text-base"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="srole" className="text-base">{t("common.role")}</Label>
                  <select
                    id="srole"
                    className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="STUDENT">{t("auth.student")}</option>
                    <option value="TEACHER">{t("auth.teacher")}</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="orgcode" className="text-base">
                    {locale === "ar" ? "رمز المؤسسة" : "Organization code"} ({t("common.optional")})
                  </Label>
                  <Input id="orgcode" className="mt-1 min-h-11 text-base" placeholder="northfield"
                    value={form.organizationCode} onChange={(e) => setForm({ ...form, organizationCode: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {locale === "ar" ? "أو أنشئ مساحة عمل خاصة بك." : "Leave empty to create your own workspace."}
                  </p>
                </div>
                {error && <p className="rounded-lg bg-destructive/10 p-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
                <Button type="submit" className="w-full min-h-11 text-base" disabled={busy}>{t("auth.signUp")}</Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Demo accounts */}
          <div className="mt-6 border-t border-border pt-4" data-decorative>
            <p className="text-sm font-semibold">{t("auth.demoAccounts")}</p>
            <p className="mb-2 text-xs text-muted-foreground">{t("auth.demoHint")} — {t("admin.demoWarning")}</p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((d) => (
                <Button key={d.email} variant="outline" className="min-h-11 justify-start text-base" disabled={busy} onClick={() => demoLogin(d.email)}>
                  {d.icon}
                  <span className="ms-2">{t(d.roleKey)}</span>
                  <span className="ms-auto text-xs text-muted-foreground">{d.email}</span>
                </Button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground" data-decorative>
        {t("a11y.wcagNote")}
      </footer>
    </div>
  );
}
