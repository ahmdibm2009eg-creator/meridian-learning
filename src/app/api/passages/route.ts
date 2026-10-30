import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const passages = await db.passage.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "none" },
      select: { id: true, title: true, text: true, source: true },
      take: 100,
    });
    return json({ passages });
  });
}
