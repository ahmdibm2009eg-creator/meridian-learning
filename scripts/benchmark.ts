/**
 * Reproducible performance benchmark for Meridian Learning.
 *
 * Measures, at 1,000 / 10,000 / 100,000 questions:
 *   - question-bank list latency (page 1, 50 per page) + filter latency
 *   - practice-set generation latency
 *   - exam autosave latency (PATCH with 10 answers)
 *   - attempt start latency (assessment with 25 items)
 *   - teacher analytics latency
 *   - SQLite file size and approximate per-request Prisma query counts
 *     (parsed from the server's PRISMA_QUERY_LOG=1 output)
 *
 * Run via scripts/run-benchmark.sh (isolates db/bench.db; never touches the
 * development or test databases).
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";
import fs from "node:fs";

const BASE = process.env.BENCH_BASE_URL ?? "http://127.0.0.1:3998";
const SERVER_LOG = process.env.BENCH_SERVER_LOG ?? "tests/bench-server.log";
const SCALES = [1_000, 10_000, 100_000];
const db = new PrismaClient();

function hash(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

const TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "SHORT_ANSWER", "NUMERIC", "ESSAY", "MATCHING", "ORDERING", "FILL_BLANK"];

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  return res;
}

class Bench {
  cookie = "";
  async login(email: string) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, password: "Bench1234!" }),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      if (pair.startsWith("lms_session=")) this.cookie = pair;
    }
    if (!this.cookie) throw new Error(`login failed for ${email}`);
  }
  async req(method: string, path: string, body?: unknown) {
    return fetchJson(path, {
      method,
      headers: { "content-type": "application/json", origin: BASE, cookie: this.cookie },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}

function percentile(sorted: number[], p: number) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  return {
    n: s.length,
    p50ms: Math.round(percentile(s, 50)),
    p95ms: Math.round(percentile(s, 95)),
    maxMs: Math.round(s[s.length - 1]),
  };
}

async function timed(fn: () => Promise<unknown>, runs: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    out.push(performance.now() - t0);
  }
  return out;
}

function logLines() {
  try {
    return fs.readFileSync(SERVER_LOG, "utf8").split("\n").filter((l) => l.includes("prisma:query")).length;
  } catch {
    return 0;
  }
}

async function countQueries(fn: () => Promise<unknown>): Promise<number> {
  const before = logLines();
  await fn();
  const after = logLines();
  return after - before;
}

async function insertQuestions(target: number, existing: number) {
  const CHUNK = 2_000;
  let created = existing;
  while (created < target) {
    const n = Math.min(CHUNK, target - created);
    const rows = Array.from({ length: n }, (_, i) => {
      const idx = created + i;
      return {
        organizationId: "bench-org",
        type: TYPES[idx % TYPES.length],
        stem: `Bench question ${idx}: compute the value of expression ${idx} and select the best answer.`,
        content: JSON.stringify({ options: [{ id: "a", text: "1" }, { id: "b", text: "2" }, { id: "c", text: "3" }, { id: "d", text: "4" }] }),
        answerKey: JSON.stringify({ correct: ["b"] }),
        explanation: `Explanation ${idx}.`,
        strategies: "{}",
        misconceptions: "[]",
        difficulty: (idx % 5) + 1,
        estimatedSeconds: 60,
        taxonomyNodeId: idx % 3 === 0 ? "bench-skill" : null,
        tags: "[]",
        points: 1,
        reviewStatus: idx % 4 === 0 ? "IN_REVIEW" : "APPROVED",
        authorId: "bench-teacher",
      };
    });
    await db.question.createMany({ data: rows });
    created += n;
    process.stdout.write(`  … ${created}/${target}\r`);
  }
  console.log();
}

async function main() {
  console.log("== Meridian benchmark ==");
  const teacher = new Bench();
  await teacher.login("teacher@bench.test");
  const student = new Bench();
  await student.login("student@bench.test");

  const results: Record<string, unknown>[] = [];
  let existing = await db.question.count({ where: { organizationId: "bench-org" } });

  for (const scale of SCALES) {
    if (existing < scale) {
      console.log(`Seeding questions to ${scale.toLocaleString()}…`);
      await insertQuestions(scale, existing);
      existing = scale;
    }
    // The bench assessment uses the first 25 APPROVED MCQ questions.
    if (!(await db.assessment.findUnique({ where: { id: "bench-asmt" } }))) {
      const pool = await db.question.findMany({
        where: { organizationId: "bench-org", type: "MCQ_SINGLE", reviewStatus: "APPROVED" },
        take: 25,
        orderBy: { stem: "asc" },
      });
      await db.assessment.create({
        data: {
          id: "bench-asmt", organizationId: "bench-org", title: "Bench Assessment",
          type: "QUIZ", status: "PUBLISHED", attemptsAllowed: 1000, feedbackMode: "AFTER_SUBMIT",
          items: { create: pool.map((q, i) => ({ questionId: q.id, position: i, points: 1 })) },
        },
      });
    }
    const dbSizeKb = Math.round(fs.statSync(process.env.BENCH_DB_PATH ?? "db/bench.db").size / 1024);

    // 1. Question bank list (page 1, 50/page)
    const warmup = await teacher.req("GET", "/api/questions?page=1&pageSize=50");
    await warmup.json();
    const listSamples = await timed(() => teacher.req("GET", "/api/questions?page=1&pageSize=50").then((r) => r.json()), 20);
    const listQueries = await countQueries(() => teacher.req("GET", "/api/questions?page=1&pageSize=50").then((r) => r.json()));

    // 2. Filtered question bank (type + status + search)
    const filterSamples = await timed(
      () => teacher.req("GET", "/api/questions?type=MCQ_SINGLE&status=APPROVED&q=expression").then((r) => r.json()),
      20
    );

    // 3. Practice-set generation (adaptive ordering)
    const practiceSamples = await timed(
      () => student.req("POST", "/api/practice/set", { limit: 20, adaptive: true }).then((r) => r.json()),
      20
    );

    // 4. Attempt start on a 25-item assessment
    const startSamples = await timed(
      () => student.req("POST", "/api/assessments/bench-asmt/attempts").then((r) => r.json()),
      10
    );

    // 5. Autosave (10 answers per PATCH)
    const startRes = await (await student.req("POST", "/api/assessments/bench-asmt/attempts")).json() as { attemptId: string };
    const asmt = await db.assessment.findUnique({ where: { id: "bench-asmt" }, include: { items: true } });
    const autosaveBody = {
      answers: asmt!.items.slice(0, 10).map((it, i) => ({
        questionId: it.questionId,
        response: { type: "MCQ_SINGLE", selected: ["b"] },
        rev: i + 1,
        timeSpentSec: 5,
      })),
    };
    const autosaveSamples = await timed(
      () => student.req("PATCH", `/api/attempts/${startRes.attemptId}`, autosaveBody).then((r) => r.json()),
      20
    );
    // submit to close the attempt (attempt budget)
    await student.req("POST", `/api/attempts/${startRes.attemptId}/submit`);

    // 6. Teacher analytics (item analysis on the bench assessment)
    const analyticsSamples = await timed(
      () => teacher.req("GET", "/api/analytics/teacher?assessmentId=bench-asmt").then((r) => r.json()),
      10
    );

    results.push({
      scale,
      dbSizeKb,
      questionList: stats(listSamples),
      questionListPrismaQueries: listQueries,
      filteredList: stats(filterSamples),
      practiceSet: stats(practiceSamples),
      attemptStart: stats(startSamples),
      autosave10: stats(autosaveSamples),
      teacherAnalytics: stats(analyticsSamples),
    });
    console.log(JSON.stringify(results[results.length - 1], null, 2));
  }

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/benchmark-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log("\nWrote docs/benchmark-results.json");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
