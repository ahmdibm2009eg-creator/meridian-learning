"use client";

import { useEffect, useCallback } from "react";
import { useApp, applyPrefsToHtml, navigate, parseHash } from "@/lib/store";
import { get, patch } from "@/lib/api-client";
import { AppShell } from "@/components/lms/AppShell";
import { AuthView } from "@/components/lms/views/AuthView";
import { Loader } from "@/components/lms/bits";
import { toast } from "@/hooks/use-toast";

import { DashboardView } from "@/components/lms/views/DashboardView";
import { CoursesView } from "@/components/lms/views/CoursesView";
import { CourseDetailView } from "@/components/lms/views/CourseDetailView";
import { LessonView } from "@/components/lms/views/LessonView";
import { AssessmentsView } from "@/components/lms/views/AssessmentsView";
import { ExamView } from "@/components/lms/views/ExamView";
import { PracticeView } from "@/components/lms/views/PracticeView";
import { MistakesView } from "@/components/lms/views/MistakesView";
import { StudyPlanView } from "@/components/lms/views/StudyPlanView";
import { VocabularyView } from "@/components/lms/views/VocabularyView";
import { TutorView } from "@/components/lms/views/TutorView";
import { GradesView } from "@/components/lms/views/GradesView";
import { CalendarView } from "@/components/lms/views/CalendarView";
import { QuestionBankView } from "@/components/lms/views/QuestionBankView";
import { AssessmentBuilderView } from "@/components/lms/views/AssessmentBuilderView";
import { AnalyticsView } from "@/components/lms/views/AnalyticsView";
import { AdminUsersView } from "@/components/lms/views/AdminUsersView";
import { AdminOrgsView } from "@/components/lms/views/AdminOrgsView";
import { AuditView } from "@/components/lms/views/AuditView";
import { AnnouncementsView } from "@/components/lms/views/AnnouncementsView";

export default function AppRoot() {
  const { user, booted, route, locale, prefs } = useApp();
  const setUser = useApp((s) => s.setUser);
  const setBooted = useApp((s) => s.setBooted);
  const setRoute = useApp((s) => s.setRoute);

  // Bootstrap session
  const boot = useCallback(async () => {
    try {
      const data = await get<{ user: typeof user; organization: { name: string; aiTutorEnabled: boolean } | null }>("/api/auth/me");
      setUser(data.user ?? null, data.organization);
    } catch {
      setUser(null);
    } finally {
      setBooted(true);
    }
  }, [setUser, setBooted]);

  useEffect(() => {
    boot();
  }, [boot]);

  // Hash routing
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [setRoute]);

  // A11y prefs → document attributes
  useEffect(() => {
    applyPrefsToHtml(prefs, locale);
  }, [prefs, locale]);

  // Ctrl+K command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useApp.getState().setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Persist prefs + locale to the account when logged in
  useEffect(() => {
    if (!user || !booted) return;
    patch("/api/auth/me", { locale, prefs }).catch(() => {});
  }, [locale, prefs, user, booted]);

  if (!booted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!user) return <AuthView onAuthed={boot} />;

  const { view, params } = route;

  const renderView = () => {
    switch (view) {
      case "courses": return <CoursesView />;
      case "course": return <CourseDetailView courseId={params[0]} />;
      case "lesson": return <LessonView lessonId={params[0]} />;
      case "assessments": return <AssessmentsView />;
      case "exam": return <ExamView attemptId={params[0]} onExit={() => navigate("assessments")} />;
      case "practice": return <PracticeView presetSkill={params[0] ?? null} presetMistakes={params[0] === "mistakes"} />;
      case "mistakes": return <MistakesView />;
      case "study-plan": return <StudyPlanView />;
      case "vocabulary": return <VocabularyView />;
      case "tutor": return <TutorView />;
      case "grades": return <GradesView />;
      case "calendar": return <CalendarView />;
      case "question-bank": return <QuestionBankView />;
      case "assessment-builder": return <AssessmentBuilderView assessmentId={params[0]} />;
      case "analytics": return <AnalyticsView />;
      case "users": return <AdminUsersView />;
      case "organizations": return <AdminOrgsView />;
      case "audit": return <AuditView />;
      case "announcements": return <AnnouncementsView />;
      case "dashboard":
      default: return <DashboardView />;
    }
  };

  // The exam takes over the whole viewport — no shell navigation behind it.
  if (view === "exam") {
    return <ExamView attemptId={params[0]} onExit={() => navigate("assessments")} />;
  }

  return (
    <AppShell onRefresh={boot}>
      {renderView()}
    </AppShell>
  );
}

export function notifyError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  toast({ title: message, variant: "destructive" });
}
