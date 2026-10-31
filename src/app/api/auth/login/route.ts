import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { handle, fail, json } from "@/lib/api";
import { rateLimit, clearRateLimit } from "@/lib/ratelimit";
import { NextRequest } from "next/server";
import { z } from "zod";

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(
      await req.json().catch(() => null)
    );
    if (!parsed.success) return fail("Enter your email and password");
    const email = parsed.data.email.toLowerCase();

    // Brute-force protection: only FAILED attempts count; success clears the bucket.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rlKey = `login:${ip}:${email}`;
    const rl = rateLimit(rlKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);
    if (!rl.ok) {
      return fail(`Too many failed sign-in attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minute(s).`, 429);
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return fail("Email or password is incorrect", 401);
    }
    if (user.suspended) return fail("This account is suspended. Contact your administrator.", 403);
    clearRateLimit(rlKey);
    await createSession(user.id);
    return json({ ok: true });
  });
}
