import { test, expect } from "@playwright/test";

/**
 * Full exam lifecycle in a real browser:
 * start → answer → autosave → reload (recovery) → submit → results.
 * Uses student-a2 so attempt state is deterministic.
 */
test.describe("exam lifecycle (browser)", () => {
  test("answer, autosave, reload to recover, then submit and see results", async ({ page }) => {
    // Login:
    await page.goto("/");
    await page.fill("#email", "student-a2@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();

    // Open the assessments list and start the Algebra Quiz:
    await page.goto("/#/assessments");
    const quizCard = page.locator("article", { has: page.getByRole("heading", { name: "Algebra Quiz" }) });
    await quizCard.getByRole("button", { name: "Start", exact: true }).click();

    // The exam shell takes over the viewport:
    await expect(page.getByText("Algebra Quiz")).toBeVisible();
    await expect(page.getByText(/Answered/i)).toBeVisible();

    // Answer the first question (MCQ_SINGLE "What is 2 + 3?", correct = 5):
    await page.getByRole("radio").filter({ hasText: "5" }).click();
    // ...and flag it for review:
    await page.getByRole("button", { name: /flag/i }).first().click();

    // Wait for the debounced autosave indicator ("✓ Saved"):
    await expect(page.getByText(/✓ Saved/)).toBeVisible({ timeout: 15_000 });

    // RELOAD mid-exam — answers must be recovered from the server:
    await page.reload();
    await expect(page.getByText(/Answered/i)).toBeVisible();
    await expect(page.getByRole("radio").filter({ hasText: "5" })).toHaveAttribute("aria-checked", "true");

    // Navigate to the True/False question via the next button and answer it:
    await page.getByRole("button", { name: "Next", exact: true }).first().click();
    await expect(page.getByText("The Sun is a star.")).toBeVisible();
    await page.getByRole("radio").filter({ hasText: /true/i }).first().click();
    await expect(page.getByText(/✓ Saved/)).toBeVisible({ timeout: 15_000 });

    // Advance to the last question, where the submit control appears:
    for (let i = 0; i < 12; i++) {
      if (await page.getByRole("button", { name: /submit assessment/i }).count()) break;
      await page.getByRole("button", { name: "Next", exact: true }).first().click();
      await page.waitForTimeout(150);
    }

    // Submit through the confirmation dialog:
    await page.getByRole("button", { name: /submit assessment/i }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /submit assessment/i }).last().click();

    // Results screen:
    await expect(page.getByText("Results")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/%/).first()).toBeVisible();
  });
});
