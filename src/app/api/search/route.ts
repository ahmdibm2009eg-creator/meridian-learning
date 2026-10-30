import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { NextRequest } from "next/server";

// Universal search across courses, lessons and (staff) questions.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return json({ courses: [], lessons: [], questions: [] });
    const term = q.slice(0, 80);

    const courses = await db.course.findMany({
      where: {
        organizationId: user.organizationId ?? "",
        OR: [{ title: { contains: term } }, { description: { contains: term } }],
      },
      select: { id: true, title: true },
      take: 6,
    });
    const lessons = await db.lesson.findMany({
      where: {
        section: { course: { organizationId: user.organizationId ?? "" } },
        OR: [{ title: { contains: term } }, { content: { contains: term } }],
      },
      select: { id: true, title: true, section: { select: { courseId: true, course: { select: { title: true } } } } },
      take: 6,
    });
    const isStaff = ["TEACHER", "AUTHOR", "ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    const questions = isStaff
      ? await db.question.findMany({
          where: { organizationId: user.organizationId ?? "", stem: { contains: term } },
          select: { id: true, stem: true, type: true },
          take: 6,
        })
      : [];
    return json({
      courses,
      lessons: lessons.map((l) => ({
        id: l.id, title: l.title, courseId: l.section.courseId, courseTitle: l.section.course.title,
      })),
      questions: questions.map((x) => ({ id: x.id, stem: x.stem.slice(0, 100), type: x.type })),
    });
  });
}
