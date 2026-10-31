import { NextRequest, NextResponse } from "next/server";

/**
 * Centralized API hardening (defense in depth) — Next 16 "proxy" convention
 * (the successor to middleware):
 *  - Same-origin enforcement on mutating requests, complementing the
 *    SameSite=Lax session cookie (blocks cross-site POST/PATCH/DELETE even
 *    if a future cookie regression reintroduces laxness).
 *  - Baseline security headers on every API response.
 *
 * Auth itself stays per-route (session → capability checks) so that each
 * handler remains independently verifiable.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      // Accept the direct Host or any forwarded host (proxy/preview setups).
      const allowed = new Set<string>();
      const host = req.headers.get("host");
      if (host) allowed.add(host);
      const forwarded = req.headers.get("x-forwarded-host");
      if (forwarded) for (const h of forwarded.split(",")) allowed.add(h.trim());
      allowed.add(req.nextUrl.host);

      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null; // malformed Origin header
      }
      if (!originHost || !allowed.has(originHost)) {
        return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
      }
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return res;
}

export const config = { matcher: ["/api/:path*"] };
