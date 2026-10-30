import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { DEFAULT_PREFS, A11yPrefs } from "@/lib/types";

function sessionPayload(user: Awaited<ReturnType<typeof getUser>>) {
  if (!user) return null;
  let prefs = DEFAULT_PREFS;
  try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(user.prefs || "{}") }; } catch { /* keep defaults */ }
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
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => null);
    const data: { locale?: string; prefs?: A11yPrefs } = {};
    if (body?.locale === "en" || body?.locale === "ar") data.locale = body.locale;
    if (body?.prefs && typeof body.prefs === "object") {
      const merged = { ...DEFAULT_PREFS, ...JSON.parse(user.prefs || "{}"), ...body.prefs };
      data.prefs = merged;
    }
    await db.user.update({ where: { id: user.id }, data: { ...data, prefs: data.prefs ? JSON.stringify(data.prefs) : user.prefs } });
    if (data.locale) await audit(user.id, "locale.change", "user", user.id, data.locale);
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    return json({ user: sessionPayload(fresh) });
  });
}
