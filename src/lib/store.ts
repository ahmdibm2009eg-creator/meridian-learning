"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionUser, A11yPrefs, Locale } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";
import { translate, isRTL } from "@/lib/i18n";

// ── Hash router ─────────────────────────────────────────────

export interface Route {
  view: string;
  params: string[];
}

export function parseHash(): Route {
  const h = typeof window !== "undefined" ? window.location.hash.replace(/^#\/?/, "") : "";
  const parts = h.split("/").filter(Boolean);
  return { view: parts[0] || "dashboard", params: parts.slice(1) };
}

export function navigate(view: string, ...params: (string | number | undefined)[]) {
  const clean = params.filter((p) => p !== undefined && p !== null && p !== "");
  window.location.hash = `#/${view}${clean.length ? "/" + clean.map(String).join("/") : ""}`;
}

// ── App store ────────────────────────────────────────────────

interface AppState {
  user: SessionUser | null;
  organization: { name: string; aiTutorEnabled: boolean } | null;
  booted: boolean;
  route: Route;
  locale: Locale;
  prefs: A11yPrefs;
  sidebarOpen: boolean;
  paletteOpen: boolean;
  a11yOpen: boolean;
  notifOpen: boolean;
  setUser: (u: SessionUser | null, org?: { name: string; aiTutorEnabled: boolean } | null) => void;
  setBooted: (b: boolean) => void;
  setRoute: (r: Route) => void;
  setLocale: (l: Locale) => void;
  setPrefs: (p: Partial<A11yPrefs>) => void;
  resetPrefs: () => void;
  setSidebar: (b: boolean) => void;
  setPalette: (b: boolean) => void;
  setA11yOpen: (b: boolean) => void;
  setNotifOpen: (b: boolean) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: () => "ltr" | "rtl";
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      organization: null,
      booted: false,
      route: { view: "dashboard", params: [] },
      locale: "en",
      prefs: DEFAULT_PREFS,
      sidebarOpen: true,
      paletteOpen: false,
      a11yOpen: false,
      notifOpen: false,
      setUser: (u, org) => set({ user: u, organization: org ?? null, locale: (u?.locale as Locale) ?? get().locale, prefs: u?.prefs ?? DEFAULT_PREFS }),
      setBooted: (b) => set({ booted: b }),
      setRoute: (r) => set({ route: r }),
      setLocale: (l) => set({ locale: l }),
      setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
      resetPrefs: () => set({ prefs: DEFAULT_PREFS }),
      setSidebar: (b) => set({ sidebarOpen: b }),
      setPalette: (b) => set({ paletteOpen: b }),
      setA11yOpen: (b) => set({ a11yOpen: b }),
      setNotifOpen: (b) => set({ notifOpen: b }),
      t: (key, params) => translate(get().locale, key, params),
      dir: () => (isRTL(get().locale) ? "rtl" : "ltr"),
    }),
    {
      name: "meridian-prefs",
      partialize: (s) => ({ locale: s.locale, prefs: s.prefs, sidebarOpen: s.sidebarOpen }),
    }
  )
);

// ── A11y side effects: mirror prefs onto <html> ──────────────

export function applyPrefsToHtml(prefs: A11yPrefs, locale: Locale) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.style.setProperty("--a11y-font-scale", String(prefs.fontScale));
  html.style.setProperty("--a11y-line-height", String(prefs.lineHeight));
  html.style.setProperty("--a11y-letter-spacing", `${prefs.letterSpacing}em`);
  html.dataset.font = prefs.fontFamily;
  html.dataset.width = prefs.readingWidth;
  html.dataset.motion = prefs.reducedMotion ? "reduced" : "full";
  html.dataset.simplified = prefs.simplified ? "on" : "off";
  html.dataset.focusMode = prefs.focusMode ? "on" : "off";
  html.dataset.paraIsolation = prefs.paragraphIsolation ? "on" : "off";
  html.dataset.underlineLinks = prefs.underlineLinks ? "on" : "off";
  html.classList.toggle("dark", prefs.theme === "dark");
  html.classList.toggle("hc", prefs.theme === "contrast");
  html.lang = locale;
  html.dir = isRTL(locale) ? "rtl" : "ltr";
}

// ── Speech (Web Speech API) ──────────────────────────────────

export function speak(text: string, locale: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale === "ar" ? "ar-SA" : "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
