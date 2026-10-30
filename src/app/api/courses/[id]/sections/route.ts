import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return fail("Course not found", 404);
    if (course.ownerId !== user.id && !["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return fail("You do not have permission to edit this course", 403);
    }
    const parsed = z.object({ title: z.string().min(1).max(160) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Section title is required");
    const count = await db.courseSection.count({ where: { courseId: id } });
    const section = await db.courseSection.create({
      data: { courseId: id, title: parsed.data.title, position: count },
    });
    await audit(user.id, "section.create", "courseSection", section.id, section.title);
    return json({ section });
  });
}
