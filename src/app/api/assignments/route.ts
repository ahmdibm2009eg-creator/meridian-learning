import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const parsed = z.object({
      courseId: z.string(),
      title: z.string().min(3).max(200),
      instructions: z.string().max(8000).default(""),
      dueAt: z.string().datetime().nullable().default(null),
      points: z.number().min(1).max(1000).default(10),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Assignment title must be at least 3 characters");
    const course = await db.course.findUnique({ where: { id: parsed.data.courseId } });
    if (!course) return fail("Course not found", 404);
    if (course.ownerId !== user.id && !["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return fail("You do not have permission to add assignments", 403);
    }
    const assignment = await db.assignment.create({
      data: {
        courseId: course.id,
        title: parsed.data.title,
        instructions: parsed.data.instructions,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        points: parsed.data.points,
        createdBy: user.id,
      },
    });
    await audit(user.id, "assignment.create", "assignment", assignment.id, assignment.title);
    return json({ assignment });
  });
}
