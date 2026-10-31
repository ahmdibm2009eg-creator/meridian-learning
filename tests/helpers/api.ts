/** HTTP client with a manual cookie jar for API integration tests. */
export const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3999";
export const TEST_PASSWORD = "Test1234!";

export const USERS = {
  super: "super@meridian.test",
  adminA: "admin-a@meridian.test",
  teacherA: "teacher-a@meridian.test",
  authorA: "author-a@meridian.test",
  studentA: "student-a@meridian.test",
  studentA2: "student-a2@meridian.test",
  suspendedA: "suspended-a@meridian.test",
  adminB: "admin-b@meridian.test",
  teacherB: "teacher-b@meridian.test",
  studentB: "student-b@meridian.test",
} as const;

export class Api {
  cookie: string | null = null;

  async login(email: string, password = TEST_PASSWORD): Promise<Response> {
    return this.req("POST", "/api/auth/login", { email, password });
  }

  async logout(): Promise<Response> {
    return this.req("POST", "/api/auth/logout");
  }

  async req(
    method: string,
    path: string,
    body?: unknown,
    opts?: { origin?: string; cookie?: string }
  ): Promise<Response> {
    const headers: Record<string, string> = { origin: opts?.origin ?? BASE };
    if (body !== undefined) headers["content-type"] = "application/json";
    const cookie = opts?.cookie ?? this.cookie;
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // Capture the session cookie from ANY response that sets it (login,
    // register, …). Deleting (expiry in the past) clears it.
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      if (pair.startsWith("lms_session=")) {
        this.cookie = pair.includes("=") && pair.split("=")[1] ? pair : null;
      }
    }
    return res;
  }

  get(path: string, opts?: { cookie?: string }) { return this.req("GET", path, undefined, opts); }
  post(path: string, body?: unknown, opts?: { origin?: string }) { return this.req("POST", path, body, opts); }
  patch(path: string, body?: unknown, opts?: { origin?: string }) { return this.req("PATCH", path, body, opts); }
  del(path: string) { return this.req("DELETE", path); }
}

/** Login helper: returns an authenticated client. */
export async function loginAs(email: string, password = TEST_PASSWORD): Promise<Api> {
  const api = new Api();
  const res = await api.login(email, password);
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed with ${res.status}: ${await res.text()}`);
  }
  return api;
}

/** Parse a JSON response body. */
export async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** All JSON values in the object must be finite numbers where numbers are expected. */
export function assertNoNaN(obj: unknown, path = "root"): string[] {
  const problems: string[] = [];
  if (typeof obj === "number" && !Number.isFinite(obj)) problems.push(`${path} = ${obj}`);
  else if (Array.isArray(obj)) obj.forEach((v, i) => problems.push(...assertNoNaN(v, `${path}[${i}]`)));
  else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) problems.push(...assertNoNaN(v, `${path}.${k}`));
  }
  return problems;
}
