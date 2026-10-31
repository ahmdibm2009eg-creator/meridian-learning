import { test, expect } from "@playwright/test";

test.describe("authentication flow (browser)", () => {
  test("valid login reaches the dashboard shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#email")).toBeVisible();
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("#email")).toBeHidden();
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
  });

  test("invalid login stays on the form", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#main-content")).toHaveCount(0);
  });

  test("logout returns to the login form and the session is gone", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", "student-a@meridian.test");
    await page.fill("#password", "Test1234!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main-content")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page.locator("#email")).toBeVisible();

    // Navigating to an app view without a session returns to login:
    await page.goto("/#/courses");
    await expect(page.locator("#email")).toBeVisible();
  });
});

test.describe("keyboard operability (no mouse)", () => {
  test("the login form is fully keyboard-operable with visible focus", async ({ page }) => {
    await page.goto("/");
    const email = page.locator("#email");
    await email.focus();
    // Tab order within the form: email → password → submit
    await page.keyboard.press("Tab");
    await expect(page.locator("#password")).toBeFocused();
    await page.keyboard.type("Test1234!");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(email).toBeFocused();
    await page.keyboard.type("student-a@meridian.test");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
    // Focus ring is visible (outline width > 0 when focused):
    const outline = await page.getByRole("button", { name: "Sign in" }).evaluate((el) => {
      const styles = getComputedStyle(el);
      return `${styles.outlineWidth} ${styles.outlineStyle}`;
    });
    expect(outline).not.toBe("0px none");
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeVisible();
  });
});
