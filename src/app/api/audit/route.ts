import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Administrator role required", 403);
    // Tenant isolation: org admins see only their own organization's events;
    // system rows (no user) are reserved for the platform administrator.
    const logs = await db.auditLog.findMany({
      where:
        user.role === "SUPER_ADMIN"
          ? {}
          : { user: { organizationId: user.organizationId ?? "__none__" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, organizationId: true } } },
    });
    return json({
      logs: logs.map((l) => ({
        id: l.id, action: l.action, entity: l.entity, entityId: l.entityId,
        detail: l.detail, createdAt: l.createdAt,
        userName: l.user?.name ?? "system",
      })),
    });
  });
}
