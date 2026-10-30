import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  return handle(async () => {
    await requireCapability("org.manage");
    const orgs = await db.organization.findMany({
      include: { _count: { select: { users: true, courses: true, questions: true } } },
      orderBy: { createdAt: "asc" },
    });
    return json({
      organizations: orgs.map((o) => ({
        id: o.id, name: o.name, slug: o.slug, brandingColor: o.brandingColor,
        aiTutorEnabled: o.aiTutorEnabled, createdAt: o.createdAt,
        users: o._count.users, courses: o._count.courses, questions: o._count.questions,
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireCapability("org.manage");
    const parsed = z.object({
      name: z.string().min(2).max(120),
      slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Organization name required; code must be lowercase letters/digits/dashes");
    if (await db.organization.findUnique({ where: { slug: parsed.data.slug } })) {
      return fail("That organization code is already taken", 409);
    }
    const org = await db.organization.create({ data: parsed.data });
    await audit(user.id, "org.create", "organization", org.id, org.name);
    return json({ organization: org });
  });
}
