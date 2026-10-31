import { test, expect } from "@playwright/test";

test.describe("course → lesson workflow (browser, persistence across reload)", () => {
  test("student enrolls context already seeded: opens course, completes a lesson, survives reload", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();

    // Course catalog → Algebra Foundations:
    await page.goto("/#/courses");
    const courseCard = page.locator("article, li, div", { has: page.getByText("Algebra Foundations") }).first();
    await courseCard.getByRole("button", { name: /enter course/i }).click();
    await expect(page.getByRole("heading", { name: "Algebra Foundations" })).toBeVisible();
    await expect(page.getByRole("button", { name: /What is a linear equation\?/ })).toBeVisible();

    // Open the lesson reader:
    await page.getByRole("button", { name: /What is a linear equation\?/ }).click();
    await expect(page.getByRole("heading", { name: /What is a linear equation\?/ })).toBeVisible();
    await expect(page.getByText("rate of change").or(page.getByText(/linear equation/i)).first()).toBeVisible();

    // Mark complete — the button is replaced by a "Completed" chip:
    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();

    // RELOAD — completion must persist (no "Mark complete" button returns):
    await page.reload();
    await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  });

  test("hash navigation keeps the view context on reload", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.goto("/#/courses");
    // Wait for the SPA to fully bootstrap and load data before reloading:
    await expect(page.getByText("Algebra Foundations")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText("Algebra Foundations")).toBeVisible({ timeout: 15_000 }); // hash + session survived reload
  });
});
