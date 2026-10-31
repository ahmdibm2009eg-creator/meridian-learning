import { describe, it, expect } from "vitest";
import { Api, loginAs, USERS, TEST_PASSWORD, body } from "../helpers/api";

describe("authentication — login, sessions, logout", () => {
  it("valid login sets an httpOnly session cookie and /me returns the user", async () => {
    const api = new Api();
    const res = await api.login(USERS.studentA);
    expect(res.status).toBe(200);
    expect(api.cookie).toMatch(/^lms_session=/);
    const me = await body<{ user: { email: string; role: string } | null }>(await api.get("/api/auth/me"));
    expect(me.user?.email).toBe(USERS.studentA);
    expect(me.user?.role).toBe("STUDENT");
  });

  it("session persists across requests without re-login", async () => {
    const api = await loginAs(USERS.teacherA);
    for (let i = 0; i < 3; i++) {
      const res = await api.get("/api/auth/me");
      expect(res.status).toBe(200);
    }
  });

  it("invalid password → 401 and no session cookie", async () => {
    const api = new Api();
    const res = await api.login(USERS.studentA, "wrong-password");
    expect(res.status).toBe(401);
    expect(api.cookie).toBeNull();
  });

  it("unknown email → 401 (same shape as wrong password)", async () => {
    const api = new Api();
    const res = await api.login("ghost@meridian.test", TEST_PASSWORD);
    expect(res.status).toBe(401);
  });

  it("suspended account → 403", async () => {
    const api = new Api();
    const res = await api.login(USERS.suspendedA);
    expect(res.status).toBe(403);
  });

  it("logout revokes the session server-side", async () => {
    const api = await loginAs(USERS.studentA);
    expect((await api.get("/api/auth/me")).status).toBe(200);
    const out = await api.logout();
    expect(out.status).toBe(200);
    const me = await body<{ user: unknown }>(await api.get("/api/auth/me"));
    expect(me.user).toBeNull();
  });
});

describe("authentication — protected routes require a session", () => {
  const PROTECTED = [
    "/api/courses",
    "/api/questions",
    "/api/assessments",
    "/api/mistakes",
    "/api/notifications",
    "/api/gradebook",
    "/api/analytics/student",
    "/api/attempts/whatever",
    "/api/admin/users",
    "/api/audit",
  ];
  it("returns 401 for every protected endpoint without a cookie", async () => {
    const anon = new Api();
    for (const path of PROTECTED) {
      const res = await anon.get(path);
      expect(res.status, `GET ${path}`).toBe(401);
    }
  });
});

describe("authentication — registration hardening", () => {
  it("REGRESSION (privilege escalation): a TEACHER role in the register payload is ignored", async () => {
    const api = new Api();
    const email = `escalate-${Date.now()}@meridian.test`;
    const res = await api.post("/api/auth/register", {
      name: "Escalation Attempt",
      email,
      password: "Password123!",
      role: "TEACHER",
      organizationCode: "alpha-test",
    });
    expect(res.status).toBe(200);
    const me = await body<{ user: { role: string } | null }>(await api.get("/api/auth/me"));
    expect(me.user?.role).toBe("STUDENT");
    // And the student cannot reach staff endpoints:
    expect((await api.get("/api/questions")).status).toBe(403);
  });

  it("duplicate email → 409", async () => {
    const api = new Api();
    const res = await api.post("/api/auth/register", {
      name: "Dup",
      email: USERS.studentA,
      password: "Password123!",
    });
    expect(res.status).toBe(409);
  });

  it("weak password → 400", async () => {
    const api = new Api();
    const res = await api.post("/api/auth/register", {
      name: "Weak",
      email: `weak-${Date.now()}@meridian.test`,
      password: "short",
    });
    expect(res.status).toBe(400);
  });
});

describe("authentication — session revocation by administrator", () => {
  it("suspending a user deletes their active sessions immediately", async () => {
    const victim = await loginAs(USERS.studentA2);
    expect((await victim.get("/api/auth/me")).status).toBe(200);

    const admin = await loginAs(USERS.adminA);
    const res = await admin.patch("/api/admin/users/student-a2", { suspended: true });
    expect(res.status).toBe(200);

    const me = await body<{ user: unknown }>(await victim.get("/api/auth/me"));
    expect(me.user).toBeNull();

    // restore for other test files
    await admin.patch("/api/admin/users/student-a2", { suspended: false });
  });

  it("an admin cannot suspend themselves", async () => {
    const admin = await loginAs(USERS.adminA);
    const res = await admin.patch("/api/admin/users/admin-a", { suspended: true });
    expect(res.status).toBe(409);
  });

  it("role changes cannot be performed by teachers (only admins)", async () => {
    const teacher = await loginAs(USERS.teacherA);
    const res = await teacher.patch("/api/admin/users/student-a", { role: "ORG_ADMIN" });
    expect(res.status).toBe(403);
  });
});

describe("authentication — brute-force lockout", () => {
  it("11 failed logins for one email → 429, other accounts unaffected", async () => {
    const api = new Api();
    const target = `bruteforce-${Date.now()}@meridian.test`;
    for (let i = 0; i < 10; i++) {
      const r = await api.login(target, "definitely-wrong");
      expect(r.status).toBe(401);
    }
    const blocked = await api.login(target, "definitely-wrong");
    expect(blocked.status).toBe(429);
    // Per-email bucket: a different account still logs in fine.
    const ok = await loginAs(USERS.studentA);
    expect((await ok.get("/api/auth/me")).status).toBe(200);
  });
});

describe("authentication — /me PATCH validation", () => {
  it("rejects out-of-range preference values", async () => {
    const api = await loginAs(USERS.studentA);
    const bad = await api.patch("/api/auth/me", { prefs: { fontScale: 99 } });
    expect(bad.status).toBe(400);
    const bad2 = await api.patch("/api/auth/me", { prefs: { theme: "neon" } });
    expect(bad2.status).toBe(400);
  });

  it("persists valid locale and preferences", async () => {
    const api = await loginAs(USERS.studentA);
    const res = await api.patch("/api/auth/me", { locale: "ar", prefs: { theme: "dark", fontScale: 1.2 } });
    expect(res.status).toBe(200);
    const me = await body<{ user: { locale: string; prefs: { theme: string; fontScale: number } } | null }>(
      await api.get("/api/auth/me")
    );
    expect(me.user?.locale).toBe("ar");
    expect(me.user?.prefs.theme).toBe("dark");
    expect(me.user?.prefs.fontScale).toBe(1.2);
    // restore defaults for other suites
    await api.patch("/api/auth/me", { locale: "en", prefs: { theme: "light", fontScale: 1 } });
  });
});
