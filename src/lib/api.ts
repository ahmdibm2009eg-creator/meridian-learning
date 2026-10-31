import { getUser, AuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new ApiError("Authentication required", 401);
  return user;
}

export async function requireCapability(cap: Capability): Promise<AuthUser> {
  const user = await requireUser();
  if (!CAPABILITIES[user.role as Role]?.includes(cap)) {
    throw new ApiError("You do not have permission to perform this action", 403);
  }
  return user;
}

export type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "TEACHER" | "AUTHOR" | "STUDENT" | "PARENT";

export type Capability =
  | "org.manage"
  | "user.manage"
  | "course.create"
  | "course.edit.own"
  | "question.create"
  | "question.edit"
  | "assessment.create"
  | "assessment.grade"
  | "analytics.teacher"
  | "analytics.admin"
  | "audit.view"
  | "tutor.use";

const CAPABILITIES: Record<Role, Capability[]> = {
  SUPER_ADMIN: ["org.manage", "user.manage", "course.create", "course.edit.own", "analytics.admin", "audit.view", "tutor.use"],
  ORG_ADMIN: [
    "org.manage", "user.manage", "course.create", "question.create", "question.edit",
    "assessment.create", "assessment.grade", "analytics.teacher", "analytics.admin", "audit.view", "tutor.use",
  ],
  TEACHER: [
    "course.create", "course.edit.own", "question.create", "question.edit",
    "assessment.create", "assessment.grade", "analytics.teacher", "tutor.use",
  ],
  AUTHOR: ["question.create", "question.edit", "assessment.create", "tutor.use"],
  STUDENT: ["tutor.use"],
  PARENT: [],
};

export function can(role: string, cap: Capability): boolean {
  return CAPABILITIES[role as Role]?.includes(cap) ?? false;
}

/** Ensure the user belongs to the same organization as the resource. */
export async function assertSameOrg(user: AuthUser, organizationId: string | null | undefined) {
  if (user.role === "SUPER_ADMIN") return;
  if (!organizationId || user.organizationId !== organizationId) {
    throw new ApiError("Resource not found in your organization", 404);
  }
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fail(err.message, err.status);
    console.error("[api]", err);
    return fail("Internal server error", 500);
  }
}

export async function audit(userId: string | null, action: string, entity: string, entityId?: string, detail = "") {
  try {
    await db.auditLog.create({ data: { userId, action, entity, entityId, detail } });
  } catch (e) {
    console.error("[audit]", e);
  }
}
