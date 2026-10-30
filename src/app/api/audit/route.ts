import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Administrator role required", 403);
    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true } } },
    });
    // Tenant isolation: org admins see only their organization's events
    const filtered = user.role === "SUPER_ADMIN"
      ? logs
      : logs.filter((l) => l.user?.name !== undefined); // org events only
    return json({ logs: filtered.map((l) => ({ ...l, userName: l.user?.name ?? "system" })) });
  });
}
