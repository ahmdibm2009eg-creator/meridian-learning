import { describe, it, expect } from "vitest";
import { loginAs, USERS, body } from "../helpers/api";
import { tdb } from "../helpers/db";

/**
 * Full course workflow:
 * teacher creates course → section → lessons → student enrolls → opens lesson
 * → completes lessons → progress updates → teacher sees progress — with
 * persistence verified through fresh GETs (simulating page reloads).
 */
describe("course workflow — authoring to completion", () => {
  let courseId = "";
  let sectionId = "";
  const lessonIds: string[] = [];

  it("teacher creates a course, a section and two lessons, then publishes the course", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const created = await body<{ course: { id: string } }>(
      await teacher.post("/api/courses", { title: "E2E Course", description: "Built by the test suite" })
    );
    courseId = created.course.id;
    expect(courseId).toBeTruthy();

    const section = await body<{ section: { id: string } }>(
      await teacher.post(`/api/courses/${courseId}/sections`, { title: "Section One" })
    );
    sectionId = section.section.id;
    expect(sectionId).toBeTruthy();

    for (const title of ["Lesson A", "Lesson B"]) {
      const lesson = await body<{ lesson: { id: string } }>(
        await teacher.post(`/api/sections/${sectionId}/lessons`, {
          title,
          content: `# ${title}\nLesson body.`,
          type: "READING",
          durationMin: 10,
          objectives: ["Objective 1"],
        })
      );
      lessonIds.push(lesson.lesson.id);
    }
    expect(lessonIds).toHaveLength(2);

    // Publish before students can enroll:
    const publish = await teacher.patch(`/api/courses/${courseId}`, { status: "PUBLISHED" });
    expect(publish.status).toBe(200);
  });

  it("students cannot author courses (capability gate)", async () => {
    const student = await loginAs(USERS.studentA);
    expect((await student.post("/api/courses", { title: "Student Course" })).status).toBe(403);
  });

  it("student enrolls, opens a lesson, and completion updates progress", async () => {
    const student = await loginAs(USERS.studentA);
    expect((await student.post(`/api/courses/${courseId}/enroll`)).status).toBe(200);

    const detail = await body<{ enrolled: boolean; sections: { lessons: { id: string; completed: boolean }[] }[]; progressPct: number }>(
      await student.get(`/api/courses/${courseId}`)
    );
    expect(detail.enrolled).toBe(true);
    expect(detail.sections[0].lessons).toHaveLength(2);
    expect(detail.progressPct).toBe(0);

    const lesson = await body<{ lesson: { title: string; content: string } }>(
      await student.get(`/api/lessons/${lessonIds[0]}`)
    );
    expect(lesson.lesson.title).toBe("Lesson A");
    expect(lesson.lesson.content).toContain("Lesson body");

    const done = await body<{ ok: boolean; progressPct: number; courseCompleted: boolean }>(
      await student.post(`/api/lessons/${lessonIds[0]}/complete`, { timeSpentMin: 6 })
    );
    expect(done.ok).toBe(true);
    expect(done.progressPct).toBe(50);
    expect(done.courseCompleted).toBe(false);
  });

  it("progress persists across a fresh read (page-reload semantics)", async () => {
    const student = await loginAs(USERS.studentA);
    const detail = await body<{ sections: { lessons: { id: string; completed: boolean }[] }[]; progressPct: number }>(
      await student.get(`/api/courses/${courseId}`)
    );
    expect(detail.sections[0].lessons.find((l) => l.id === lessonIds[0])?.completed).toBe(true);
    expect(detail.sections[0].lessons.find((l) => l.id === lessonIds[1])?.completed).toBe(false);
    expect(detail.progressPct).toBe(50);
  });

  it("re-completing an already-completed lesson does not duplicate time excessively or break state", async () => {
    const student = await loginAs(USERS.studentA);
    const res = await body<{ ok: boolean; progressPct: number }>(
      await student.post(`/api/lessons/${lessonIds[0]}/complete`, { timeSpentMin: 3 })
    );
    expect(res.ok).toBe(true);
    expect(res.progressPct).toBe(50);
  });

  it("final lesson completion marks the course complete with exactly ONE gradebook entry", async () => {
    const student = await loginAs(USERS.studentA);
    const done = await body<{ courseCompleted: boolean; progressPct: number }>(
      await student.post(`/api/lessons/${lessonIds[1]}/complete`, { timeSpentMin: 8 })
    );
    expect(done.courseCompleted).toBe(true);
    expect(done.progressPct).toBe(100);

    // REGRESSION (double-completion race / duplicate entries): re-completing
    // the last lesson again must not add a second completion entry.
    await student.post(`/api/lessons/${lessonIds[1]}/complete`, { timeSpentMin: 1 });
    const entries = await tdb.gradeEntry.count({
      where: { courseId, studentId: "student-a", itemType: "LESSON" },
    });
    expect(entries).toBe(1);
  });

  it("the teacher sees roster progress for the course", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const detail = await body<{ roster: { id: string; name: string; progressPct: number; status: string }[] }>(
      await teacher.get(`/api/courses/${courseId}`)
    );
    const row = detail.roster.find((r) => r.id === "student-a");
    expect(row).toBeTruthy();
    expect(row!.progressPct).toBe(100);
    expect(row!.status).toBe("COMPLETED");
  });

  it("enrollment is deduplicated (unique constraint)", async () => {
    const student = await loginAs(USERS.studentA);
    await student.post(`/api/courses/${courseId}/enroll`);
    const count = await tdb.enrollment.count({ where: { courseId, studentId: "student-a" } });
    expect(count).toBe(1);
  });

  it("unenrolled students cannot complete lessons", async () => {
    const outsider = await loginAs(USERS.studentA2);
    expect((await outsider.post(`/api/lessons/${lessonIds[0]}/complete`)).status).toBe(403);
  });
});

describe("assignment workflow — create, submit, grade, re-grade", () => {
  let assignmentId = "";

  it("teacher creates an assignment in the course", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const courses = await body<{ courses: { id: string; title: string }[] }>(await teacher.get("/api/courses"));
    const courseId = courses.courses.find((c) => c.title === "E2E Course")?.id;
    expect(courseId, "course from the previous suite must exist").toBeTruthy();
    const res = await body<{ assignment: { id: string } }>(
      await teacher.post("/api/assignments", {
        courseId,
        title: "E2E Essay Assignment",
        instructions: "Write three paragraphs.",
        points: 20,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      })
    );
    assignmentId = res.assignment.id;
    expect(assignmentId).toBeTruthy();
  });

  it("student submits text; teacher grades it; gradebook gets exactly one entry", async () => {
    const student = await loginAs(USERS.studentA);
    const submit = await student.post(`/api/assignments/${assignmentId}/submit`, { text: "My three paragraphs…" });
    expect(submit.status).toBe(200);

    const teacher = await loginAs(USERS.teacherA);
    const grade = await teacher.post(`/api/assignments/${assignmentId}/grade`, {
      studentId: "student-a",
      grade: 17,
      feedback: "Good structure.",
    });
    expect(grade.status).toBe(200);
    const entries = await tdb.gradeEntry.findMany({
      where: { assignmentId, studentId: "student-a", itemType: "ASSIGNMENT" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].score).toBe(17);
  });

  it("REGRESSION (re-grade duplication): re-grading updates in place instead of stacking entries", async () => {
    const teacher = await loginAs(USERS.teacherA);
    await teacher.post(`/api/assignments/${assignmentId}/grade`, {
      studentId: "student-a",
      grade: 19,
      feedback: "Revised after review.",
    });
    const entries = await tdb.gradeEntry.findMany({
      where: { assignmentId, studentId: "student-a", itemType: "ASSIGNMENT" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].score).toBe(19);
  });

  it("graded submissions are locked against student re-submission", async () => {
    const student = await loginAs(USERS.studentA);
    const res = await student.post(`/api/assignments/${assignmentId}/submit`, { text: "trying again" });
    expect(res.status).toBe(409);
  });

  it("grading rejects out-of-range values and unknown students", async () => {
    const teacher = await loginAs(USERS.teacherA);
    expect(
      (await teacher.post(`/api/assignments/${assignmentId}/grade`, { studentId: "student-a", grade: 999 })).status
    ).toBe(400);
    expect(
      (await teacher.post(`/api/assignments/${assignmentId}/grade`, { studentId: "student-b", grade: 1 })).status
    ).toBe(404);
  });
});

describe("study planner — generation, completion, replan-preserves-history", () => {
  it("generates a plan with explainable tasks, allows completion, and preserves history on replan", async () => {
    const student = await loginAs(USERS.studentA);
    const res = await student.post("/api/study-plan", {
      goalExam: "SAT",
      examDate: new Date(Date.now() + 21 * 86400000).toISOString(),
      targetScore: 1200,
      weeklyHours: 8,
    });
    expect(res.status).toBe(200);
    const { plan } = await body<{ plan: { id: string; tasks: { id: string; title: string; reason: string; status: string }[] } }>(res);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks.every((t) => t.reason.length > 0)).toBe(true);

    // Complete one task, then replan:
    const firstTask = plan.tasks[0];
    expect((await student.patch(`/api/study-tasks/${firstTask.id}`, { status: "DONE" })).status).toBe(200);
    const kept = await tdb.studyTask.findUnique({ where: { id: firstTask.id } });
    expect(kept?.status).toBe("DONE");

    await student.post("/api/study-plan", {
      goalExam: "SAT",
      examDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      targetScore: 1300,
      weeklyHours: 10,
    });
    const stillThere = await tdb.studyTask.findUnique({ where: { id: firstTask.id } });
    expect(stillThere?.status).toBe("DONE"); // history preserved across replans
  });
});
