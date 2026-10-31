import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { handle, json, fail } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

const MODES = ["HINT", "SOCRATIC", "EXPLAIN", "PLAN"] as const;
type Mode = (typeof MODES)[number];

const MODE_PROMPTS: Record<Mode, string> = {
  HINT: `You are a tutor in HINT-ONLY mode. Rules:
- NEVER state or directly reveal the final answer.
- Give one small, concrete hint that nudges the student forward.
- Keep it under 80 words. End with a short guiding question.`,
  SOCRATIC: `You are a Socratic tutor. Rules:
- NEVER state the final answer directly.
- Ask one focused question at a time that helps the student discover the next step.
- If they are stuck twice on the same idea, break the idea into a smaller question.
- Keep each reply under 120 words.`,
  EXPLAIN: `You are a patient tutor giving a full explanation. Rules:
- Walk through the reasoning step by step, numbered.
- Define technical terms when first used.
- Finish with the key takeaway in one sentence.`,
  PLAN: `You are a study coach. Rules:
- Give practical, prioritized study advice.
- Reference concrete skills or habits the student mentions.
- Keep it under 150 words, use a short list.`,
};

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);

    // Capability gate: the AI tutor costs real money — only roles with the
    // tutor.use capability may call it.
    if (![
      "SUPER_ADMIN", "ORG_ADMIN", "TEACHER", "AUTHOR", "STUDENT",
    ].includes(user.role)) {
      return fail("You do not have permission to use the AI tutor", 403);
    }
    // Rate limit per user (bounds AI cost exposure).
    const rl = rateLimit(`tutor:${user.id}`, 30, 5 * 60 * 1000);
    if (!rl.ok) {
      return fail("You are sending messages too quickly — wait a moment and try again.", 429);
    }

    const org = user.organizationId
      ? await db.organization.findUnique({ where: { id: user.organizationId } })
      : null;
    if (org && !org.aiTutorEnabled) return fail("The AI tutor has been disabled by your organization.", 403);

    const body = await req.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
    const mode: Mode = MODES.includes(body?.mode) ? body.mode : "EXPLAIN";
    if (!message) return fail("Type a question first");

    // Context: current question (if any)
    let questionContext = "";
    let activeExam = false;
    if (typeof body?.questionId === "string" && body.questionId) {
      const q = await db.question.findUnique({ where: { id: body.questionId } });
      if (q && (q.organizationId === user.organizationId || user.role === "SUPER_ADMIN")) {
        const content = JSON.parse(q.content || "{}");
        const options =
          Array.isArray(content.options) && content.options.length > 0
            ? "\nOptions:\n" + content.options.map((o: { text: string }) => `- ${o.text}`).join("\n")
            : "";
        questionContext = `The student is working on this question:\n"""${q.stem}"""${options}\n(Question type: ${q.type})`;

        // Exam-safe: never leak answers while an attempt containing this
        // question is in progress, or for a pending graded assessment the
        // student has not yet taken (pre-exam harvesting via the tutor).
        const attempt = await db.attempt.findFirst({
          where: { studentId: user.id, status: "IN_PROGRESS" },
          include: { assessment: { include: { items: true } } },
        });
        if (attempt && attempt.assessment.items.some((it) => it.questionId === q.id)) {
          activeExam = true;
          if (mode === "EXPLAIN") {
            return fail("Full explanations are disabled during assessments. Switch to hint or Socratic mode.", 403);
          }
        }
        if (!activeExam) {
          const gradedUsage = await db.assessmentItem.findFirst({
            where: {
              questionId: q.id,
              assessment: {
                status: { in: ["PUBLISHED", "CLOSED"] },
                type: { in: ["EXAM", "MOCK", "QUIZ", "DIAGNOSTIC"] },
                organizationId: q.organizationId,
              },
            },
            select: { id: true },
          });
          if (gradedUsage) {
            const prior = await db.answer.findFirst({
              where: {
                questionId: q.id,
                attempt: { studentId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
              },
              select: { id: true },
            });
            if (!prior) {
              activeExam = true;
              if (mode === "EXPLAIN") {
                return fail("Full explanations are disabled for questions in upcoming assessments. Switch to hint or Socratic mode.", 403);
              }
            }
          }
        }
      }
    }

    const history = await db.tutorMessage.findMany({
      where: { studentId: user.id },
      orderBy: { createdAt: "asc" },
      take: 12,
    });

    const system = `${MODE_PROMPTS[mode]}
${activeExam ? "IMPORTANT: This question is part of an assessment in progress — you must not reveal or narrow down the final answer." : ""}
${questionContext}
The student's name is ${user.name}. Reply in the same language the student writes in (English or Arabic).`;
    const messages: { role: string; content: string }[] = [
      { role: "system", content: system },
      ...history.slice(-8).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content.slice(0, 1500) })),
      { role: "user", content: message },
    ];

    await db.tutorMessage.create({ data: { studentId: user.id, questionId: body?.questionId ?? null, role: "user", mode, content: message } });

    let reply: string;
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
      } as never);
      reply = (completion as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim() ?? "";
      if (!reply) throw new Error("Empty completion");
    } catch (err) {
      console.error("[tutor]", err);
      reply =
        mode === "HINT"
          ? "The AI service is unavailable right now. Hint: re-read the question and list what you are given and what you are asked to find — the gap between them is usually one step."
          : "The AI service is unavailable right now. Try again in a moment — meanwhile, restate the problem in your own words and note what you know and what you still need.";
    }

    await db.tutorMessage.create({ data: { studentId: user.id, questionId: body?.questionId ?? null, role: "assistant", mode, content: reply } });
    return json({ reply, mode, activeExam });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    const history = await db.tutorMessage.findMany({
      where: { studentId: user.id },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    return json({ history });
  });
}

export async function DELETE() {
  return handle(async () => {
    const user = await getUser();
    if (!user) return fail("Authentication required", 401);
    await db.tutorMessage.deleteMany({ where: { studentId: user.id } });
    return json({ ok: true });
  });
}
