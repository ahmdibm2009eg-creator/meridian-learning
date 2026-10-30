import { db } from "@/lib/db";
import { getUser, hashPassword } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Administrator role required", 403);
    const role = req.nextUrl.searchParams.get("role");
    const users = await db.user.findMany({
      where: {
        ...(user.role === "SUPER_ADMIN" ? {} : { organizationId: user.organizationId }),
        ...(role ? { role } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true, name: true, email: true, role: true, suspended: true, createdAt: true,
        organizationId: true, organization: { select: { name: true } },
      },
    });
    return json({ users });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Administrator role required", 403);
    const parsed = z.object({
      name: z.string().min(1).max(120),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["ORG_ADMIN", "TEACHER", "AUTHOR", "STUDENT", "PARENT"]),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Check the form — password must be at least 8 characters");
    const { name, email, password, role } = parsed.data;
    if (await db.user.findUnique({ where: { email: email.toLowerCase() } })) {
      return fail("An account with this email already exists", 409);
    }
    const created = await db.user.create({
      data: {
        name, email: email.toLowerCase(), passwordHash: hashPassword(password),
        role, organizationId: user.organizationId,
      },
    });
    await audit(user.id, "user.create", "user", created.id, `${role} ${email}`);
    return json({ user: { id: created.id, name, email, role } });
  });
}
