/** Minimal fixtures for the benchmark database (run by run-benchmark.sh). */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();
function hash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

async function main() {
  await db.organization.upsert({
    where: { id: "bench-org" },
    update: {},
    create: { id: "bench-org", name: "Bench Org", slug: "bench-org" },
  });
  await db.taxonomyNode.upsert({
    where: { id: "bench-skill" },
    update: {},
    create: { id: "bench-skill", organizationId: "bench-org", name: "Bench Skill", level: "SKILL" },
  });
  await db.user.upsert({
    where: { id: "bench-teacher" },
    update: {},
    create: { id: "bench-teacher", email: "teacher@bench.test", name: "Bench Teacher", role: "TEACHER", organizationId: "bench-org", passwordHash: hash("Bench1234!") },
  });
  await db.user.upsert({
    where: { id: "bench-student" },
    update: {},
    create: { id: "bench-student", email: "student@bench.test", name: "Bench Student", role: "STUDENT", organizationId: "bench-org", passwordHash: hash("Bench1234!") },
  });
  console.log("Bench fixtures ready.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
