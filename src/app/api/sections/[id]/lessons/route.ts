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
    const section = await db.courseSection.findUnique({ where: { id }, include: { course: true } });
    if (!section) return fail("Section not found", 404);
    const course = section.course;
    if (course.ownerId !== user.id && !["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return fail("You do not have permission to edit this course", 403);
    }
    const parsed = z.object({
      title: z.string().min(1).max(200),
      content: z.string().default(""),
      type: z.enum(["READING", "VIDEO", "PRACTICE", "INTERACTIVE"]).default("READING"),
      durationMin: z.number().int().min(1).max(600).default(20),
      objectives: z.array(z.string().max(300)).max(10).default([]),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Lesson title is required");
    const count = await db.lesson.count({ where: { sectionId: id } });
    const lesson = await db.lesson.create({
      data: {
        sectionId: id,
        title: parsed.data.title,
        content: parsed.data.content,
        type: parsed.data.type,
        durationMin: parsed.data.durationMin,
        objectives: JSON.stringify(parsed.data.objectives),
        position: count,
      },
    });
    await audit(user.id, "lesson.create", "lesson", lesson.id, lesson.title);
    return json({ lesson });
  });
}
