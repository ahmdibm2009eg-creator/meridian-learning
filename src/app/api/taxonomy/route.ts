import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const nodes = await db.taxonomyNode.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId ?? "none" },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { questions: true } } },
    });
    return json({
      nodes: nodes.map((n) => ({
        id: n.id, name: n.name, level: n.level, parentId: n.parentId,
        description: n.description, questionCount: n._count.questions,
      })),
    });
  });
}
