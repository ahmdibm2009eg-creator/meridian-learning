import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const events = await db.calendarEvent.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "__none__" },
      orderBy: { startAt: "asc" },
      take: 100,
    });
    const now = new Date();
    return json({
      upcoming: events.filter((e) => e.endAt >= now),
      past: events.filter((e) => e.endAt < now).slice(-10),
    });
  });
}
