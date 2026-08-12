import { test, expect } from "@playwright/test";

test("landing page loads and shows the hero CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ask LegalSetu").first()).toBeVisible();
});

test("unauthenticated user is redirected away from dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
});
