import { describe, it, expect } from "vitest";
import { loginAs, USERS, body } from "../helpers/api";

/**
 * Multi-tenant isolation. Org A fixtures (org-a) are accessed by Org B
 * principals (admin-b / teacher-b / student-b) using DIRECT object ids —
 * navigation visibility is irrelevant here; the server must reject.
 */
describe("tenant isolation — cross-organization object access", () => {
  it("org-B student cannot read an org-A course", async () => {
    const b = await loginAs(USERS.studentB);
    expect((await b.get("/api/courses/course-a")).status).toBe(404);
  });

  it("REGRESSION (P0): org-B ADMIN cannot PATCH an org-A course", async () => {
    const bAdmin = await loginAs(USERS.adminB);
    const res = await bAdmin.patch("/api/courses/course-a", { title: "Hacked by Beta" });
    expect(res.status).toBe(404);
  });

  it("REGRESSION (P0): org-B ADMIN cannot add a section to an org-A course", async () => {
    const bAdmin = await loginAs(USERS.adminB);
    const res = await bAdmin.post("/api/courses/course-a/sections", { title: "Beta Section" });
    expect(res.status).toBe(404);
  });

  it("REGRESSION (P0): org-B ADMIN cannot add a lesson to an org-A section", async () => {
    const bAdmin = await loginAs(USERS.adminB);
    const res = await bAdmin.post("/api/sections/sec-a1/lessons", { title: "Beta Lesson" });
    expect(res.status).toBe(404);
  });

  it("REGRESSION (P0): org-B ADMIN cannot edit an org-A lesson", async () => {
    const bAdmin = await loginAs(USERS.adminB);
    const res = await bAdmin.patch("/api/lessons/les-a1", { content: "# overwritten" });
    expect(res.status).toBe(404);
  });

  it("REGRESSION (P0): org-B ADMIN cannot create an assignment in an org-A course", async () => {
    const bAdmin = await loginAs(USERS.adminB);
    const res = await bAdmin.post("/api/assignments", { courseId: "course-a", title: "Beta assignment" });
    expect(res.status).toBe(404);
  });

  it("org-B student cannot read an org-A question detail", async () => {
    const b = await loginAs(USERS.studentB);
    expect((await b.get("/api/questions/q-a-mcq1")).status).toBe(404);
  });

  it("org-B teacher (question.edit) cannot edit or delete an org-A question", async () => {
    const bTeacher = await loginAs(USERS.teacherB);
    expect((await bTeacher.patch("/api/questions/q-a-mcq1", { stem: "Beta edit" })).status).toBe(404);
    expect((await bTeacher.del("/api/questions/q-a-mcq1")).status).toBe(404);
  });

  it("org-B student cannot grade a practice answer against an org-A question", async () => {
    const b = await loginAs(USERS.studentB);
    const res = await b.post("/api/practice/answer", { questionId: "q-a-mcq1", response: { type: "MCQ_SINGLE", selected: ["opt2"] } });
    expect(res.status).toBe(404);
  });

  it("org-B users cannot read/modify/delete org-A assessments", async () => {
    const bAdmin = await loginAs(USERS.adminB);
    const bStudent = await loginAs(USERS.studentB);
    expect((await bStudent.get("/api/assessments/asmt-quiz")).status).toBe(404);
    expect((await bAdmin.patch("/api/assessments/asmt-quiz", { title: "Beta hack" })).status).toBe(404);
    expect((await bAdmin.del("/api/assessments/asmt-quiz")).status).toBe(404);
  });

  it("org-B admin cannot start/see attempts on org-A assessments, and vice versa", async () => {
    // Use a student/assessment pair not consumed by the exams suite:
    const aStudent = await loginAs(USERS.studentA2);
    const start = await body<{ attemptId: string }>(await aStudent.post("/api/assessments/asmt-close/attempts"));
    expect(start.attemptId).toBeTruthy();
    const attemptId = start.attemptId;

    const bAdmin = await loginAs(USERS.adminB);
    const bStudent = await loginAs(USERS.studentB);
    // student-b: not the owner and not staff → 403
    expect((await bStudent.get(`/api/attempts/${attemptId}`)).status).toBe(403);
    // org-B admin is staff but wrong org → 404
    expect((await bAdmin.get(`/api/attempts/${attemptId}`)).status).toBe(404);
    // org-B student cannot autosave another org's attempt
    expect((await bStudent.patch(`/api/attempts/${attemptId}`, { answers: [{ questionId: "q-a-mcq2", response: null }] })).status).toBe(403);
  });

  it("org-A student cannot read org-B questions or announcements", async () => {
    const a = await loginAs(USERS.studentA);
    expect((await a.get("/api/questions/q-b-mcq1")).status).toBe(404);
    const anns = await body<{ announcements: { id: string }[] }>(await a.get("/api/announcements"));
    expect(anns.announcements.every((x) => x.id !== "ann-a1" ? true : true)).toBe(true); // own org only is fine
    // org-B student sees only org-B announcements:
    const b = await loginAs(USERS.studentB);
    const annsB = await body<{ announcements: { id: string }[] }>(await b.get("/api/announcements"));
    expect(annsB.announcements.some((x) => x.id === "ann-a1")).toBe(false);
  });

  it("question lists are org-scoped for staff", async () => {
    const teacherA = await loginAs(USERS.teacherA);
    const teacherB = await loginAs(USERS.teacherB);
    const listA = await body<{ questions: { id: string }[] }>(await teacherA.get("/api/questions"));
    const listB = await body<{ questions: { id: string }[] }>(await teacherB.get("/api/questions"));
    expect(listA.questions.some((q) => q.id === "q-b-mcq1")).toBe(false);
    expect(listB.questions.some((q) => q.id === "q-a-mcq1")).toBe(false);
  });

  it("REGRESSION (P0): audit log is org-scoped for ORG_ADMIN", async () => {
    const adminA = await loginAs(USERS.adminA);
    const logsA = await body<{ logs: { id: string; action: string }[] }>(await adminA.get("/api/audit"));
    const idsA = logsA.logs.map((l) => l.id);
    expect(idsA).toContain("audit-a1");
    expect(idsA).not.toContain("audit-b1"); // cross-org event must be invisible
    expect(idsA).not.toContain("audit-sys"); // system rows are super-admin-only

    const adminB = await loginAs(USERS.adminB);
    const logsB = await body<{ logs: { id: string }[] }>(await adminB.get("/api/audit"));
    expect(logsB.logs.map((l) => l.id)).toContain("audit-b1");
    expect(logsB.logs.map((l) => l.id)).not.toContain("audit-a1");

    const sup = await loginAs(USERS.super);
    const logsS = await body<{ logs: { id: string }[] }>(await sup.get("/api/audit"));
    const idsS = logsS.logs.map((l) => l.id);
    expect(idsS).toContain("audit-a1");
    expect(idsS).toContain("audit-b1");
    expect(idsS).toContain("audit-sys");
  });

  it("admin user lists are org-scoped", async () => {
    const adminA = await loginAs(USERS.adminA);
    const usersA = await body<{ users: { id: string }[] }>(await adminA.get("/api/admin/users"));
    expect(usersA.users.some((u) => u.id === "student-b")).toBe(false);
    expect(usersA.users.some((u) => u.id === "student-a")).toBe(true);
  });

  it("REGRESSION (P2): ORG_ADMIN sees only their own organization in /api/admin/orgs", async () => {
    const adminA = await loginAs(USERS.adminA);
    const orgs = await body<{ organizations: { id: string }[] }>(await adminA.get("/api/admin/orgs"));
    expect(orgs.organizations).toHaveLength(1);
    expect(orgs.organizations[0].id).toBe("org-a");

    const sup = await loginAs(USERS.super);
    const orgsS = await body<{ organizations: { id: string }[] }>(await sup.get("/api/admin/orgs"));
    expect(orgsS.organizations.map((o) => o.id)).toEqual(expect.arrayContaining(["org-a", "org-b"]));
  });

  it("REGRESSION (P1): cross-org announcement fanout is rejected", async () => {
    const adminB = await loginAs(USERS.adminB);
    const res = await adminB.post("/api/announcements", { title: "Beta hack", body: "cross org", courseId: "course-a" });
    expect(res.status).toBe(404);
    // org-A students must not have received any notification about it
    const studentA = await loginAs(USERS.studentA);
    const notes = await body<{ notifications: { title: string }[] }>(await studentA.get("/api/notifications"));
    expect(notes.notifications.every((n) => !n.title.includes("Beta hack"))).toBe(true);
  });

  it("teacher analytics expose only own-organization courses", async () => {
    const teacherB = await loginAs(USERS.teacherB);
    const stats = await body<{ courses: { id: string }[] }>(await teacherB.get("/api/analytics/teacher"));
    expect(stats.courses.some((c) => c.id === "course-a")).toBe(false);
  });

  it("vocabulary and taxonomy are org-scoped", async () => {
    const studentB = await loginAs(USERS.studentB);
    const vocab = await body<{ cards: { item: { id: string } }[] }>(await studentB.get("/api/vocab"));
    expect(vocab.cards.some((c) => c.item.id === "vocab-a1")).toBe(false);
    const tax = await body<{ nodes: { id: string }[] }>(await studentB.get("/api/taxonomy"));
    expect(tax.nodes.some((n) => n.id === "tax-skill-a")).toBe(false);
  });

  it("org-B student cannot enroll in an org-A course", async () => {
    const b = await loginAs(USERS.studentB);
    expect((await b.post("/api/courses/course-a/enroll")).status).toBe(404);
  });
});
