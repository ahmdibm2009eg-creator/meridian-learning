import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";

/**
 * WCAG 2.2 AA automated audit of every major screen (axe-core).
 * Violations with impact moderate/serious/critical FAIL the suite;
 * minor ones are logged and collected into tests/a11y/results.json
 * for the accessibility report.
 */
const COLLECTED: Record<string, unknown[]> = {};

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await page.fill("#email", email);
  await page.fill("#password", "Test1234!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}

async function scan(page: import("@playwright/test").Page, name: string) {
  await page.waitForTimeout(400); // let charts/animations settle
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact && ["moderate", "serious", "critical"].includes(v.impact)
  );
  COLLECTED[name] = results.violations.map((v) => ({
    id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
  }));
  if (results.violations.length > 0) {
    console.log(`[axe:${name}]`);
    for (const v of results.violations) console.log(`   ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.help}`);
  }
  expect(blocking, `${name}: blocking accessibility violations (axe-core)`).toEqual([]);
}

test.afterAll(() => {
  try {
    fs.mkdirSync("tests/a11y", { recursive: true });
    fs.writeFileSync("tests/a11y/results.json", JSON.stringify(COLLECTED, null, 2));
  } catch { /* best effort artifact */ }
});

test.describe("axe-core — public screen", () => {
  test("login", async ({ page }) => {
    await page.goto("/");
    await scan(page, "login");
  });
});

test.describe("axe-core — student screens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student-a@meridian.test");
  });

  for (const [name, hash] of [
    ["student-dashboard", "/#/dashboard"],
    ["student-courses", "/#/courses"],
    ["student-course-detail", "/#/course/course-a"],
    ["student-lesson-reader", "/#/lesson/les-a1"],
    ["student-assessments", "/#/assessments"],
    ["student-practice", "/#/practice"],
    ["student-mistakes", "/#/mistakes"],
    ["student-study-plan", "/#/plan"],
    ["student-vocabulary", "/#/vocab"],
    ["student-tutor", "/#/tutor"],
    ["student-grades", "/#/grades"],
    ["student-calendar", "/#/calendar"],
    ["student-announcements", "/#/announcements"],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(hash);
      await page.waitForTimeout(600);
      await scan(page, name);
    });
  }

  test("student-a11y-panel (open dialog)", async ({ page }) => {
    await page.goto("/#/dashboard");
    await page.getByRole("button", { name: "Accessibility preferences" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, "student-a11y-panel");
  });

  test("student-exam-interface", async ({ page }) => {
    await page.goto("/#/assessments");
    // Start (or continue) the "Feedback After Close Quiz" attempt:
    const card = page.locator("article", { has: page.getByRole("heading", { name: "Feedback After Close Quiz" }) });
    await card.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText(/Answered/i)).toBeVisible();
    await scan(page, "student-exam-interface");
  });
});

test.describe("axe-core — teacher screens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "teacher-a@meridian.test");
  });

  for (const [name, hash] of [
    ["teacher-dashboard", "/#/dashboard"],
    ["teacher-question-bank", "/#/qbank"],
    ["teacher-assessment-builder", "/#/assessment-builder"],
    ["teacher-analytics", "/#/analytics"],
    ["teacher-course-authoring", "/#/course/course-a"],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(hash);
      await page.waitForTimeout(600);
      await scan(page, name);
    });
  }
});

test.describe("axe-core — administrator screens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin-a@meridian.test");
  });

  for (const [name, hash] of [
    ["admin-users", "/#/admin-users"],
    ["admin-organizations", "/#/admin-orgs"],
    ["admin-audit", "/#/audit"],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(hash);
      await page.waitForTimeout(600);
      await scan(page, name);
    });
  }
});

test.describe("axe-core — Arabic RTL screens", () => {
  test("arabic-dashboard and lesson (dir=rtl)", async ({ page }) => {
    await login(page, "student-a@meridian.test");
    try {
      await page.getByRole("button", { name: /Language: العربية|اللغة: English/i }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await scan(page, "arabic-dashboard");

      await page.goto("/#/lesson/les-a1");
      await page.waitForTimeout(600);
      await scan(page, "arabic-lesson-reader");
    } finally {
      // Always restore English so a failure here cannot poison later runs.
      if (await page.locator("html").getAttribute("dir") === "rtl") {
        await page.getByRole("button", { name: /اللغة: English|Language: العربية/i }).click().catch(() => {});
      }
    }
  });
});
