import { test, expect } from "@playwright/test";

test.describe("accessibility preferences & RTL (browser)", () => {
  test("preferences persist across reload and logout/login", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();

    // Open the accessibility panel:
    await page.getByRole("button", { name: "Accessibility preferences" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    // Switch to the dark theme:
    await panel.getByRole("radio", { name: /dark/i }).first().click();
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Persist across reload:
    await page.reload();
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Persist across logout + login:
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page.locator("#email")).toBeVisible();
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Restore light theme for the a11y scans that follow:
    await page.getByRole("button", { name: "Accessibility preferences" }).click();
    const p2 = page.getByRole("dialog");
    await p2.getByRole("radio", { name: /light/i }).first().click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.keyboard.press("Escape");
  });

  test("switching to Arabic flips the document to RTL with translated chrome", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();

    try {
      await page.getByRole("button", { name: /Language: العربية|اللغة: English/i }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
      await expect(page.getByText(/أهلًا بعودتك/i)).toBeVisible();

      // Direction persists across reload:
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    } finally {
      // Restore English for subsequent suites even if an assertion failed:
      if ((await page.locator("html").getAttribute("dir")) === "rtl") {
        await page.getByRole("button", { name: /اللغة: English|Language: العربية/i }).click().catch(() => {});
      }
    }
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("200% zoom (640px viewport) does not require horizontal scrolling (reflow)", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();

    // 200% zoom of a 1280px viewport ≈ 640px effective width:
    await page.setViewportSize({ width: 640, height: 800 });
    await page.waitForTimeout(500);
    const hasHScroll200 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(hasHScroll200).toBe(false);

    // 400% zoom of 1280px ≈ 320px (WCAG 1.4.10 reflow target):
    await page.setViewportSize({ width: 320, height: 600 });
    await page.waitForTimeout(500);
    const hasHScroll400 = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(hasHScroll400).toBe(false);
  });
});
