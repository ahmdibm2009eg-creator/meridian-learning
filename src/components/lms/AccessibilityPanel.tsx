"use client";

import { useApp, navigate, speak, stopSpeaking } from "@/lib/store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

  function Row({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id: string }) {
    return (
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-base font-medium">{label}</Label>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    );
  }

export function AccessibilityPanel() {
  const { a11yOpen, setA11yOpen, prefs, setPrefs, resetPrefs, t, locale } = useApp();
  const [rulerOn, setRulerOn] = useState(prefs.readingRuler);
  const [progressOn, setProgressOn] = useState(prefs.progressIndicator);

  // Reading ruler follows the pointer (pointer-events: none)
  useEffect(() => {
    let el = document.getElementById("reading-ruler");
    if (rulerOn && !el) {
      el = document.createElement("div");
      el.id = "reading-ruler";
      document.body.appendChild(el);
    }
    if (!rulerOn && el) el.remove();
    if (rulerOn && el) {
      const move = (e: MouseEvent) => {
        el!.style.top = `${e.clientY - 22}px`;
      };
      window.addEventListener("mousemove", move);
      return () => {
        window.removeEventListener("mousemove", move);
        el?.remove();
      };
    }
  }, [rulerOn]);

  // Page-scroll progress bar
  useEffect(() => {
    let el = document.getElementById("reading-progress");
    if (progressOn && !el) {
      el = document.createElement("div");
      el.id = "reading-progress";
      document.body.appendChild(el);
    }
    if (!progressOn && el) el.remove();
    if (progressOn && el) {
      const onScroll = () => {
        const h = document.documentElement;
        const pct = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100;
        el!.style.width = `${pct}%`;
      };
      window.addEventListener("scroll", onScroll);
      onScroll();
      return () => {
        window.removeEventListener("scroll", onScroll);
        el?.remove();
      };
    }
  }, [progressOn]);

  // Sync local toggles with persisted prefs
  useEffect(() => { setPrefs({ readingRuler: rulerOn, progressIndicator: progressOn }); }, [rulerOn, progressOn, setPrefs]);

  return (
    <Sheet open={a11yOpen} onOpenChange={setA11yOpen}>
      <SheetContent side={locale === "ar" ? "left" : "right"} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl">{t("a11y.title")}</SheetTitle>
          <SheetDescription className="text-base">{t("a11y.subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6 pb-10">
          {/* Test the speech engine */}
          <div>
            <h3 className="mb-2 font-semibold">{t("a11y.reading")}</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => speak(t("a11y.tts"), locale)}>
                ▶ {t("lesson.listen")}
              </Button>
              <Button variant="outline" onClick={stopSpeaking}>
                ■ {t("lesson.stopListen")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("a11y.tts")}</p>
          </div>

          <section className="border-t border-border pt-4">
            <h3 className="mb-1 font-semibold">{t("a11y.appearance")}</h3>
            <Row label={t("a11y.theme")} id="theme">
              <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={t("a11y.theme")}>
                {(["light", "dark", "contrast"] as const).map((th) => (
                  <button
                    key={th}
                    role="radio"
                    aria-checked={prefs.theme === th}
                    onClick={() => setPrefs({ theme: th })}
                    className={cn(
                      "min-h-9 rounded-lg border-2 px-2 py-1 text-xs font-semibold",
                      prefs.theme === th ? "border-primary bg-primary/10 text-primary" : "border-border"
                    )}
                  >
                    {t(`a11y.theme.${th}`)}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t("a11y.simplified")} hint={t("a11y.simplifiedHint")} id="simplified">
              <Switch id="simplified" checked={prefs.simplified} onCheckedChange={(v) => setPrefs({ simplified: v })} />
            </Row>
            <Row label={t("a11y.underlineLinks")} id="links">
              <Switch id="links" checked={prefs.underlineLinks} onCheckedChange={(v) => setPrefs({ underlineLinks: v })} />
            </Row>
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-1 font-semibold">{t("a11y.text")}</h3>
            <div className="py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-base font-medium">{t("a11y.textSize")}</span>
                <span className="text-sm tabular-nums text-muted-foreground" aria-hidden>{Math.round(prefs.fontScale * 100)}%</span>
              </div>
              <Slider
                aria-label={`${t("a11y.textSize")}: ${Math.round(prefs.fontScale * 100)}%`}
                min={0.85} max={1.6} step={0.05}
                value={[prefs.fontScale]}
                onValueChange={([v]) => setPrefs({ fontScale: v })}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("a11y.textSizeHint")}</p>
            </div>
            <div className="py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-base font-medium">{t("a11y.lineHeight")}</span>
                <span className="text-sm tabular-nums text-muted-foreground" aria-hidden>{prefs.lineHeight.toFixed(2)}</span>
              </div>
              <Slider aria-label={t("a11y.lineHeight")} min={1.4} max={2.2} step={0.1} value={[prefs.lineHeight]} onValueChange={([v]) => setPrefs({ lineHeight: v })} />
            </div>
            <div className="py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-base font-medium">{t("a11y.letterSpacing")}</span>
                <span className="text-sm tabular-nums text-muted-foreground" aria-hidden>{prefs.letterSpacing.toFixed(2)}em</span>
              </div>
              <Slider aria-label={t("a11y.letterSpacing")} min={0} max={0.12} step={0.01} value={[prefs.letterSpacing]} onValueChange={([v]) => setPrefs({ letterSpacing: v })} />
            </div>
            <Row label={t("a11y.font")} id="font">
              <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={t("a11y.font")}>
                {(["system", "dyslexia", "serif"] as const).map((f) => (
                  <button
                    key={f}
                    role="radio"
                    aria-checked={prefs.fontFamily === f}
                    onClick={() => setPrefs({ fontFamily: f })}
                    className={cn(
                      "min-h-9 rounded-lg border-2 px-2 py-1 text-xs font-semibold",
                      prefs.fontFamily === f ? "border-primary bg-primary/10 text-primary" : "border-border"
                    )}
                  >
                    {t(`a11y.font.${f}`)}
                  </button>
                ))}
              </div>
            </Row>
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-1 font-semibold">{t("a11y.reading")}</h3>
            <Row label={t("a11y.readingWidth")} id="width">
              <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label={t("a11y.readingWidth")}>
                {(["narrow", "comfortable", "wide", "full"] as const).map((w) => (
                  <button
                    key={w}
                    role="radio"
                    aria-checked={prefs.readingWidth === w}
                    onClick={() => setPrefs({ readingWidth: w })}
                    className={cn(
                      "min-h-9 rounded-lg border-2 px-2 py-1 text-xs font-semibold",
                      prefs.readingWidth === w ? "border-primary bg-primary/10 text-primary" : "border-border"
                    )}
                  >
                    {t(`a11y.width.${w}`)}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t("a11y.readingRuler")} hint={t("a11y.readingRulerHint")} id="ruler">
              <Switch id="ruler" checked={rulerOn} onCheckedChange={setRulerOn} />
            </Row>
            <Row label={t("a11y.paragraphIsolation")} id="para">
              <Switch id="para" checked={prefs.paragraphIsolation} onCheckedChange={(v) => setPrefs({ paragraphIsolation: v })} />
            </Row>
            <Row label={t("a11y.progressIndicator")} id="prog">
              <Switch id="prog" checked={progressOn} onCheckedChange={setProgressOn} />
            </Row>
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="mb-1 font-semibold">{t("a11y.motion")}</h3>
            <Row label={t("a11y.reducedMotion")} hint={t("a11y.reducedMotionHint")} id="motion">
              <Switch id="motion" checked={prefs.reducedMotion} onCheckedChange={(v) => setPrefs({ reducedMotion: v })} />
            </Row>
            <Row label={t("a11y.focusMode")} hint={t("a11y.focusModeHint")} id="focusm">
              <Switch id="focusm" checked={prefs.focusMode} onCheckedChange={(v) => setPrefs({ focusMode: v })} />
            </Row>
            <div className="mt-2 rounded-lg border border-border bg-muted p-3">
              <p className="text-xs font-semibold">{t("a11y.shortcuts")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("a11y.shortcutsHint")}</p>
            </div>
          </section>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={resetPrefs}>{t("a11y.reset")}</Button>
            <Button variant="outline" onClick={() => navigate("announcements")}>{t("announcements.title")}</Button>
            <Button className="ms-auto" onClick={() => setA11yOpen(false)}>{t("common.close")}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
