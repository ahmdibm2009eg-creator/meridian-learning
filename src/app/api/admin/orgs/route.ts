import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, requireCapability, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  return handle(async () => {
    const user = await requireCapability("org.manage");
    // Tenant isolation: ORG_ADMIN sees only their own organization;
    // creating and listing all organizations is reserved for SUPER_ADMIN.
    if (user.role !== "SUPER_ADMIN") {
      const org = user.organizationId
        ? await db.organization.findUnique({
            where: { id: user.organizationId },
            include: { _count: { select: { users: true, courses: true, questions: true } } },
          })
        : null;
      return json({
        organizations: org
          ? [{
              id: org.id, name: org.name, slug: org.slug, brandingColor: org.brandingColor,
              aiTutorEnabled: org.aiTutorEnabled, createdAt: org.createdAt,
              users: org._count.users, courses: org._count.courses, questions: org._count.questions,
            }]
          : [],
      });
    }
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
    if (user.role !== "SUPER_ADMIN") return fail("Only the platform administrator can create organizations", 403);
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
