import { test, expect } from "@playwright/test";

test("landing page loads and shows the hero CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /get started free/i })).toBeVisible();
  await expect(page.getByText(/Understand your rights/i).first()).toBeVisible();
});

test("unauthenticated user is redirected away from dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
});
