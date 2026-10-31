import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { DEFAULT_PREFS, A11yPrefs } from "@/lib/types";
import { z } from "zod";

function sessionPayload(user: Awaited<ReturnType<typeof getUser>>) {
  if (!user) return null;
  const prefs = safeParsePrefs(user.prefs);
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    organizationId: user.organizationId, locale: user.locale, prefs,
  };
}

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return json({ user: null });
    const org = user.organizationId
      ? await db.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, aiTutorEnabled: true } })
      : null;
    return json({ user: sessionPayload(user), organization: org });
  });
}

// Update own locale / accessibility preferences
const prefsSchema = z
  .object({
    fontScale: z.number().min(0.85).max(1.6),
    lineHeight: z.number().min(1.4).max(2.2),
    letterSpacing: z.number().min(0).max(0.12),
    fontFamily: z.enum(["system", "dyslexia", "serif"]),
    readingWidth: z.enum(["narrow", "comfortable", "wide", "full"]),
    theme: z.enum(["light", "dark", "contrast"]),
    reducedMotion: z.boolean(),
    simplified: z.boolean(),
    focusMode: z.boolean(),
    readingRuler: z.boolean(),
    paragraphIsolation: z.boolean(),
    underlineLinks: z.boolean(),
    progressIndicator: z.boolean(),
  })
  .partial()
  .strict();

function safeParsePrefs(raw: string): A11yPrefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw || "{}") as Partial<A11yPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => null);
    const data: { locale?: string; prefs?: A11yPrefs } = {};
    if (body?.locale === "en" || body?.locale === "ar") data.locale = body.locale;
    if (body?.prefs && typeof body.prefs === "object") {
      const parsedPrefs = prefsSchema.safeParse(body.prefs);
      if (!parsedPrefs.success) {
        return fail("Invalid accessibility preference values");
      }
      const merged = { ...safeParsePrefs(user.prefs), ...parsedPrefs.data };
      data.prefs = merged;
    }
    await db.user.update({ where: { id: user.id }, data: { ...data, prefs: data.prefs ? JSON.stringify(data.prefs) : user.prefs } });
    if (data.locale) await audit(user.id, "locale.change", "user", user.id, data.locale);
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    return json({ user: sessionPayload(fresh) });
  });
}
