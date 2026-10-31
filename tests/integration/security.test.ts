import { describe, it, expect } from "vitest";
import { Api, loginAs, USERS, body } from "../helpers/api";
import { tdb } from "../helpers/db";

describe("transport security — middleware (origin + headers)", () => {
  it("mutating requests with a foreign Origin are rejected (403)", async () => {
    const api = new Api();
    const res = await api.req("POST", "/api/auth/login", { email: USERS.studentA, password: "Test1234!" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const patch = await api.req("PATCH", "/api/auth/me", { locale: "ar" }, { origin: "https://evil.example" });
    expect(patch.status).toBe(403);
  });

  it("requests without an Origin header (curl, server-to-server) still pass", async () => {
    const res = await fetch("http://127.0.0.1:3999/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: USERS.studentA, password: "wrong" }),
    });
    expect(res.status).toBe(401); // rejected by credentials, not by origin
  });

  it("API responses carry baseline security headers", async () => {
    const res = await fetch("http://127.0.0.1:3999/api/auth/me");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  });

  it("session cookies are httpOnly + SameSite=Lax (+ Secure in production)", async () => {
    const api = new Api();
    const res = await api.login(USERS.studentA);
    const setCookie = (res.headers.getSetCookie?.() ?? []).join("\n");
    expect(setCookie).toContain("lms_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    // The test server runs a production build, so Secure must be set:
    expect(setCookie).toContain("Secure");
  });
});

describe("authorization — role gates on admin surfaces", () => {
  it("students/teachers cannot list or create users", async () => {
    const student = await loginAs(USERS.studentA);
    const teacher = await loginAs(USERS.teacherA);
    expect((await student.get("/api/admin/users")).status).toBe(403);
    expect((await teacher.get("/api/admin/users")).status).toBe(403);
    expect((await student.post("/api/admin/users", { name: "x", email: "x@x.test", password: "Password123!", role: "STUDENT" })).status).toBe(403);
  });

  it("only SUPER_ADMIN can create organizations", async () => {
    const adminA = await loginAs(USERS.adminA);
    const res = await adminA.post("/api/admin/orgs", { name: "Rogue Org", slug: "rogue" });
    expect(res.status).toBe(403);
    const sup = await loginAs(USERS.super);
    const ok = await sup.post("/api/admin/orgs", { name: "Ci Org", slug: "ci-org" });
    expect(ok.status).toBe(200);
  });

  it("students cannot view the audit log or admin analytics", async () => {
    const student = await loginAs(USERS.studentA);
    expect((await student.get("/api/audit")).status).toBe(403);
    expect((await student.get("/api/analytics/admin")).status).toBe(403);
    expect((await student.get("/api/analytics/teacher")).status).toBe(403);
  });

  it("teachers cannot grade other teachers' courses they do not own (owner gate)", async () => {
    // teacher-b does not own course-a (also cross-org, but the owner gate must
    // hold even inside one org): use author-a (no course ownership) on course-a.
    const author = await loginAs(USERS.authorA);
    expect((await author.patch("/api/courses/course-a", { title: "Author hack" })).status).toBe(403);
    expect((await author.post("/api/courses/course-a/sections", { title: "Author section" })).status).toBe(403);
  });
});

describe("AI tutor — guards", () => {
  it("requires authentication", async () => {
    const anon = new Api();
    expect((await anon.post("/api/tutor", { message: "hello" })).status).toBe(401);
  });

  it("respects the organization kill switch", async () => {
    await tdb.organization.update({ where: { id: "org-b" }, data: { aiTutorEnabled: false } });
    const studentB = await loginAs(USERS.studentB);
    const res = await studentB.post("/api/tutor", { message: "hello", mode: "HINT" });
    expect(res.status).toBe(403);
    await tdb.organization.update({ where: { id: "org-b" }, data: { aiTutorEnabled: true } });
    // re-enabled:
    const ok = await studentB.post("/api/tutor", { message: "hello", mode: "HINT" });
    expect([200, 500]).toContain(ok.status); // may fall back to offline message; never 401/403
  });

  it("EXPLAIN mode is blocked for questions in a pending graded assessment", async () => {
    // Fresh student; q-a-tf is inside the published EXAM "asmt-timed".
    const reg = new Api();
    await reg.post("/api/auth/register", { name: "Tutor Test", email: `tutor-${Date.now()}@meridian.test`, password: "Password123!", organizationCode: "alpha-test" });
    const res = await reg.post("/api/tutor", { message: "Explain this question fully", mode: "EXPLAIN", questionId: "q-a-tf" });
    expect(res.status).toBe(403);
    // HINT mode remains allowed:
    const hint = await reg.post("/api/tutor", { message: "Give me a hint", mode: "HINT", questionId: "q-a-tf" });
    expect(hint.status).not.toBe(403);
  });

  it("empty messages are rejected", async () => {
    const student = await loginAs(USERS.studentA);
    expect((await student.post("/api/tutor", { message: "" })).status).toBe(400);
  });
});

describe("data hygiene — JSON safety", () => {
  it("no API response contains NaN/Infinity serialized values", async () => {
    const student = await loginAs(USERS.studentA);
    for (const path of ["/api/analytics/student", "/api/mistakes", "/api/notifications", "/api/gradebook", "/api/calendar"]) {
      const res = await student.get(path);
      expect(res.status, `GET ${path}`).toBe(200);
      const text = await res.clone().text();
      expect(text).not.toContain("NaN");
      expect(text).not.toContain("Infinity");
    }
  });
});
