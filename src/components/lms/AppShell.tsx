"use client";

import { useEffect, useState } from "react";
import { useApp, navigate } from "@/lib/store";
import { get, patch, post } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AccessibilityPanel } from "@/components/lms/AccessibilityPanel";
import { CommandPalette } from "@/components/lms/CommandPalette";
import {
  LayoutDashboard, BookOpen, ClipboardList, Dumbbell, ListChecks, CalendarCheck,
  GraduationCap, MessagesSquare, Trophy, CalendarDays, Database, FilePlus2, BarChart3,
  Users, Building2, ScrollText, Megaphone, Bell, Search, Globe, LogOut, Menu,
  Accessibility, Languages, ChevronRight,
} from "lucide-react";

interface NavItem { view: string; labelKey: string; icon: React.ReactNode }

const STUDENT_NAV: { section: string; items: NavItem[] }[] = [
  { section: "nav.learning", items: [
    { view: "dashboard", labelKey: "nav.dashboard", icon: <LayoutDashboard className="size-5" aria-hidden /> },
    { view: "courses", labelKey: "nav.courses", icon: <BookOpen className="size-5" aria-hidden /> },
    { view: "assessments", labelKey: "nav.assessments", icon: <ClipboardList className="size-5" aria-hidden /> },
    { view: "practice", labelKey: "nav.practice", icon: <Dumbbell className="size-5" aria-hidden /> },
    { view: "mistakes", labelKey: "nav.mistakes", icon: <ListChecks className="size-5" aria-hidden /> },
    { view: "study-plan", labelKey: "nav.studyPlan", icon: <CalendarCheck className="size-5" aria-hidden /> },
    { view: "vocabulary", labelKey: "nav.vocabulary", icon: <GraduationCap className="size-5" aria-hidden /> },
    { view: "tutor", labelKey: "nav.tutor", icon: <MessagesSquare className="size-5" aria-hidden /> },
  ] },
  { section: "nav.administration", items: [
    { view: "grades", labelKey: "nav.grades", icon: <Trophy className="size-5" aria-hidden /> },
    { view: "calendar", labelKey: "nav.calendar", icon: <CalendarDays className="size-5" aria-hidden /> },
  ] },
];

const TEACHER_NAV: { section: string; items: NavItem[] }[] = [
  { section: "nav.teaching", items: [
    { view: "dashboard", labelKey: "nav.dashboard", icon: <LayoutDashboard className="size-5" aria-hidden /> },
    { view: "courses", labelKey: "nav.courses", icon: <BookOpen className="size-5" aria-hidden /> },
    { view: "question-bank", labelKey: "nav.questionBank", icon: <Database className="size-5" aria-hidden /> },
    { view: "assessments", labelKey: "nav.builder", icon: <FilePlus2 className="size-5" aria-hidden /> },
    { view: "analytics", labelKey: "nav.analytics", icon: <BarChart3 className="size-5" aria-hidden /> },
  ] },
  { section: "nav.administration", items: [
    { view: "announcements", labelKey: "announcements.title", icon: <Megaphone className="size-5" aria-hidden /> },
    { view: "calendar", labelKey: "nav.calendar", icon: <CalendarDays className="size-5" aria-hidden /> },
  ] },
];

const ADMIN_NAV: { section: string; items: NavItem[] }[] = [
  { section: "nav.administration", items: [
    { view: "dashboard", labelKey: "nav.dashboard", icon: <LayoutDashboard className="size-5" aria-hidden /> },
    { view: "users", labelKey: "nav.users", icon: <Users className="size-5" aria-hidden /> },
    { view: "courses", labelKey: "nav.courses", icon: <BookOpen className="size-5" aria-hidden /> },
    { view: "question-bank", labelKey: "nav.questionBank", icon: <Database className="size-5" aria-hidden /> },
    { view: "analytics", labelKey: "nav.analytics", icon: <BarChart3 className="size-5" aria-hidden /> },
    { view: "announcements", labelKey: "announcements.title", icon: <Megaphone className="size-5" aria-hidden /> },
    { view: "calendar", labelKey: "nav.calendar", icon: <CalendarDays className="size-5" aria-hidden /> },
  ] },
  { section: "nav.organizations", items: [
    { view: "organizations", labelKey: "nav.audit", icon: <Building2 className="size-5" aria-hidden /> },
    { view: "audit", labelKey: "nav.audit", icon: <ScrollText className="size-5" aria-hidden /> },
  ] },
];

export function navForRole(role: string) {
  if (role === "ORG_ADMIN" || role === "SUPER_ADMIN") return ADMIN_NAV;
  if (role === "TEACHER" || role === "AUTHOR") return TEACHER_NAV;
  return STUDENT_NAV;
}

function NavList({ nav, activeView, onNavigate }: { nav: { section: string; items: NavItem[] }[]; activeView: string; onNavigate?: () => void }) {
  const t = useApp((s) => s.t);
  return (
    <nav aria-label={t("nav.menu")} className="flex flex-col gap-5">
      {nav.map((section) => (
        <div key={section.section}>
          <h2 className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t(section.section)}</h2>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = activeView === item.view || (item.view === "courses" && activeView === "course");
              return (
                <li key={item.view}>
                  <button
                    onClick={() => { navigate(item.view); onNavigate?.(); }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-base font-medium transition-colors",
                      active ? "bg-primary/15 font-semibold text-primary" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {item.icon}
                    <span className="flex-1">{t(item.labelKey)}</span>
                    {active && <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ orgName }: { orgName: string | null }) {
  const t = useApp((s) => s.t);
  return (
    <div className="flex items-center gap-3 px-3 pb-4">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-primary font-black text-xl text-primary-foreground" aria-hidden> M </div>
      <div>
        <p className="text-lg font-bold leading-tight">{t("app.name")}</p>
        <p className="text-xs text-muted-foreground">{orgName ?? t("app.tagline")}</p>
      </div>
    </div>
  );
}

export function AppShell({ children, onRefresh }: { children: React.ReactNode; onRefresh: () => void }) {
  const { user, route, t, locale, sidebarOpen } = useApp();
  const setSidebar = useApp((s) => s.setSidebar);
  const setLocale = useApp((s) => s.setLocale);
  const [notifs, setNotifs] = useState<{ id: string; title: string; body: string; view: string; read: boolean; createdAt: string }[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const nav = navForRole(user?.role ?? "STUDENT");

  useEffect(() => {
    get<{ notifications: typeof notifs }>("/api/notifications").then((d) => setNotifs(d.notifications)).catch(() => {});
  }, [route.view]);

  const unread = notifs.filter((n) => !n.read).length;

  async function markAllRead() {
    await patch("/api/notifications", {}).catch(() => {});
    setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
  }

  async function logout() {
    await post("/api/auth/logout").catch(() => {});
    location.hash = "";
    location.reload();
  }

  function toggleLocale() {
    setLocale(locale === "en" ? "ar" : "en");
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        {t("nav.skipToContent")}
      </a>

      <div className="mx-auto flex w-full max-w-[110rem]">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border bg-card/60 p-4 lg:flex",
            sidebarOpen ? "w-72" : "w-0 overflow-hidden p-0"
          )}
          aria-label={t("nav.menu")}
          data-decorative={sidebarOpen ? undefined : "true"}
        >
          <Brand orgName={user?.organizationName ?? null} />
          <div className="flex-1 overflow-y-auto scroll-list !max-h-none">
            <NavList nav={nav} activeView={route.view} />
          </div>
          <div className="border-t border-border pt-3 text-xs text-muted-foreground" data-decorative>
            <p>WCAG 2.2 AA · EN / العربية</p>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
            {/* flex-wrap: at 320px (400% zoom) the action buttons wrap to a
                second row instead of forcing horizontal scrolling (WCAG 1.4.10). */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-5">
              {/* Mobile nav */}
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="lg" className="lg:hidden" aria-label={t("nav.menu")}>
                    <Menu className="size-6" aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent side={locale === "ar" ? "right" : "left"} className="w-72 overflow-y-auto p-4">
                  <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
                  <Brand orgName={user?.organizationName ?? null} />
                  <NavList nav={nav} activeView={route.view} onNavigate={() => setMobileNavOpen(false)} />
                </SheetContent>
              </Sheet>

              {/* Sidebar collapse (desktop) */}
              <Button
                variant="ghost"
                size="lg"
                className="hidden lg:inline-flex"
                aria-label={sidebarOpen ? "Collapse menu" : "Expand menu"}
                onClick={() => setSidebar(!sidebarOpen)}
              >
                <Menu className="size-5" aria-hidden />
              </Button>

              <button
                onClick={() => useApp.getState().setPalette(true)}
                className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 text-muted-foreground hover:bg-muted sm:max-w-md"
              >
                <Search className="size-4" aria-hidden />
                <span className="hidden text-sm sm:inline">{t("nav.commandPalette")}</span>
                <kbd className="ms-auto hidden rounded border border-border bg-muted px-1.5 text-xs sm:block" aria-hidden>Ctrl K</kbd>
              </button>

              <span className="flex items-center gap-1">
                {/* Notifications */}
                <div className="relative">
                  <Button variant="ghost" size="lg" aria-label={`${t("notif.title")}${unread ? `, ${t("notif.unread", { n: unread })}` : ""}`} onClick={() => setNotifOpen(!notifOpen)}>
                    <Bell className="size-5" aria-hidden />
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-destructive-foreground" aria-hidden>
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Button>
                  {notifOpen && (
                    <div className="absolute end-0 top-12 z-50 w-80 rounded-xl border border-border bg-popover p-3 shadow-lg" role="dialog" aria-label={t("notif.title")}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold">{t("notif.title")}</p>
                        <button className="text-sm text-primary underline-offset-4 hover:underline" onClick={markAllRead}>{t("notif.markAllRead")}</button>
                      </div>
                      {notifs.length === 0 ? (
                        <p className="py-4 text-center text-muted-foreground">{t("notif.empty")}</p>
                      ) : (
                        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                          {notifs.slice(0, 10).map((n) => (
                            <li key={n.id}>
                              <button
                                className={cn("w-full rounded-lg p-2 text-start hover:bg-muted", !n.read && "bg-primary/5")}
                                onClick={() => { navigate(n.view || "dashboard"); setNotifOpen(false); }}
                              >
                                <p className="text-sm font-semibold">{n.title}</p>
                                <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Language — the visible text is the target language name so it
                    is contained in the accessible name (axe label-content-name). */}
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={toggleLocale}
                  aria-label={`${t("common.language")}: ${locale === "en" ? t("common.arabic") : t("common.english")}`}
                >
                  <Globe className="size-5" aria-hidden />
                  <span className="text-sm font-semibold">{locale === "en" ? "العربية" : "English"}</span>
                </Button>

                {/* Accessibility */}
                <Button variant="ghost" size="lg" onClick={() => useApp.getState().setA11yOpen(true)} aria-label={t("a11y.title")}>
                  <Accessibility className="size-5" aria-hidden />
                </Button>

                {/* User */}
                <div className="ms-1 hidden items-center gap-2 sm:flex">
                  <div className="text-end">
                    <p className="text-sm font-semibold leading-tight">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(user?.role ?? "")}</p>
                  </div>
                  <Button variant="ghost" size="lg" onClick={logout} aria-label={t("common.logout")} title={t("common.logout")}>
                    <LogOut className="size-5" aria-hidden />
                  </Button>
                </div>
                <Button variant="ghost" size="lg" className="sm:hidden" onClick={logout} aria-label={t("common.logout")}>
                  <LogOut className="size-5" aria-hidden />
                </Button>
              </span>
            </div>
          </header>

          <main id="main-content" className="flex-1 px-3 py-6 sm:px-6 lg:px-8" tabIndex={-1}>
            {children}
          </main>

          <footer className="mt-auto border-t border-border px-6 py-4 text-center text-xs text-muted-foreground" data-decorative>
            {t("app.name")} — {t("app.tagline")} · {t("a11y.wcagNote")}
          </footer>
        </div>
      </div>

      <AccessibilityPanel />
      <CommandPalette />
      <button className="sr-only" onClick={() => useApp.getState().setA11yOpen(true)}>a11y</button>
      <span className="sr-only" aria-live="polite" id="app-live-region" />
    </div>
  );
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    SUPER_ADMIN: "Super admin", ORG_ADMIN: "Administrator", TEACHER: "Teacher",
    AUTHOR: "Content author", STUDENT: "Student", PARENT: "Guardian",
  };
  return map[role] ?? role;
}
