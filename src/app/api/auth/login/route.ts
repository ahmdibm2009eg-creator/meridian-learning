import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { handle, fail, json } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(
      await req.json().catch(() => null)
    );
    if (!parsed.success) return fail("Enter your email and password");
    const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return fail("Email or password is incorrect", 401);
    }
    if (user.suspended) return fail("This account is suspended. Contact your administrator.", 403);
    await createSession(user.id);
    return json({ ok: true });
  });
}
