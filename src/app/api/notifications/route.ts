import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({ notifications, unread: notifications.filter((n) => !n.read).length });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const body = await req.json().catch(() => null);
    if (body?.id) {
      await db.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { read: true } });
    } else {
      await db.notification.updateMany({ where: { userId: user.id }, data: { read: true } });
    }
    return json({ ok: true });
  });
}
