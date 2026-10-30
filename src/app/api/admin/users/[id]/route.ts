import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Administrator role required", 403);
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return fail("User not found", 404);
    if (target.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN") return fail("User not found", 404);
    if (target.id === user.id) return fail("You cannot suspend your own account", 409);
    const body = await req.json().catch(() => null);
    const data: Record<string, unknown> = {};
    if (typeof body?.suspended === "boolean") data.suspended = body.suspended;
    if (typeof body?.role === "string" && ["ORG_ADMIN", "TEACHER", "AUTHOR", "STUDENT", "PARENT"].includes(body.role)) {
      data.role = body.role;
    }
    await db.user.update({ where: { id }, data });
    if (data.suspended === true) await db.session.deleteMany({ where: { userId: id } });
    await audit(user.id, body?.suspended === true ? "user.suspend" : "user.update", "user", id, String(data.role ?? ""));
    return json({ ok: true });
  });
}
