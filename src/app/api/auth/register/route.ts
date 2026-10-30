import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { handle, fail, json } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["STUDENT", "TEACHER"]).default("STUDENT"),
  organizationCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("Please check your details — password must be at least 8 characters");
    const { name, email, password, role, organizationCode } = parsed.data;

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return fail("An account with this email already exists", 409);

    // Join an organization by its slug, or create a personal workspace org.
    let organizationId: string | null = null;
    if (organizationCode?.trim()) {
      const org = await db.organization.findUnique({ where: { slug: organizationCode.trim().toLowerCase() } });
      if (!org) return fail("No organization matches that code", 404);
      organizationId = org.id;
    } else {
      const org = await db.organization.create({
        data: {
          name: `${name}'s workspace`,
          slug: `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        },
      });
      organizationId = org.id;
    }

    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        role,
        organizationId,
      },
    });

    await createSession(user.id);
    await db.notification.create({
      data: {
        userId: user.id,
        title: "Welcome to Meridian",
        body: "Take a diagnostic or browse the catalog to get started.",
        view: "courses",
      },
    });
    return json({ ok: true });
  });
}
