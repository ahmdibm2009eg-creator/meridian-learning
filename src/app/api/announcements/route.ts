import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail, audit } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const announcements = await db.announcement.findMany({
      where: { organizationId: user.organizationId ?? "" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { author: { select: { name: true } } },
    });
    return json({ announcements });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    if (!["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role)) return fail("Staff only", 403);
    const parsed = z.object({
      title: z.string().min(3).max(200),
      body: z.string().min(3).max(4000),
      courseId: z.string().nullable().default(null),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Title and message are required");
    const announcement = await db.announcement.create({
      data: {
        organizationId: user.organizationId ?? "none",
        courseId: parsed.data.courseId,
        authorId: user.id,
        title: parsed.data.title,
        body: parsed.data.body,
      },
    });
    // Notify enrolled students
    if (parsed.data.courseId) {
      const enrollments = await db.enrollment.findMany({
        where: { courseId: parsed.data.courseId, status: "ACTIVE" },
        select: { studentId: true },
      });
      if (enrollments.length > 0) {
        await db.notification.createMany({
          data: enrollments.map((e) => ({
            userId: e.studentId,
            title: `Announcement: ${parsed.data.title}`,
            body: parsed.data.body.slice(0, 140),
            view: "course",
            viewId: parsed.data.courseId ?? undefined,
          })),
        });
      }
    }
    await audit(user.id, "announcement.create", "announcement", announcement.id);
    return json({ announcement });
  });
}
