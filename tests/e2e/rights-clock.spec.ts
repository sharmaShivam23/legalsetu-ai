// ==========================================================
// Rights Clock — end-to-end, through the real UI.
//
// Needs a running server whose database has a verified user:
//   E2E_EMAIL=… E2E_PASSWORD=… E2E_BASE_URL=http://localhost:3100 \
//     npx playwright test tests/e2e/rights-clock.spec.ts
// Skipped when E2E_EMAIL is not set.
// ==========================================================

import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOT_DIR;

/** YYYY-MM-DD in India, offset by `days`. */
function istDate(days: number): string {
  return new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
}

test.describe("Rights Clock", () => {
  test.skip(!EMAIL, "E2E_EMAIL not set");

  test("a family member calculates, saves, downloads and updates a tracker", async ({ page }) => {
    test.setTimeout(120_000);

    // ---- Sign in through the real login page ----
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder("name@example.com").fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // ---- Reach it from the sidebar ----
    await page.getByRole("link", { name: "Rights Clock" }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/rights-clock$/);
    await expect(page.getByRole("heading", { name: "Rights Clock" })).toBeVisible();

    // An account that already has trackers shows the list first.
    const newTracker = page.getByRole("button", { name: "New tracker" });
    const nameField = page.getByLabel("Name of the person in custody");
    await expect(newTracker.or(nameField)).toBeVisible({ timeout: 15_000 });
    if (await newTracker.isVisible()) await newTracker.click();

    // ---- Fill the form: theft, remanded 69 days ago, first-time offender ----
    await page.getByLabel("Name of the person in custody").fill("Ravi Kumar");
    await page.getByLabel("Your relationship to them").fill("Brother");
    await page.getByLabel("Date of arrest").fill(istDate(-70));
    await page.getByLabel("First remand date").fill(istDate(-69));
    await page.getByLabel("BNS sections on the FIR").fill("303(2), 3(5)");
    await page.getByRole("radiogroup", { name: "Prior conviction" }).getByRole("radio", { name: "No", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Other pending cases" }).getByRole("radio", { name: "No", exact: true }).click();

    // ---- Live result appears without saving ----
    await expect(page.getByText("Default bail is available NOW", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Do this now")).toBeVisible();
    await expect(page.getByText("BNS §303(2)").first()).toBeVisible();
    await expect(page.getByText("Imprisonment up to 3 years", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("is a general provision", { exact: false })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rights-clock-form.png`, fullPage: true });

    // ---- Optional details, then save ----
    await page.getByRole("button", { name: "Case details for the application drafts" }).click();
    await page.getByLabel("FIR number").fill("0123/2026");
    await page.getByLabel("Police station").fill("Saket");
    await page.getByLabel("Court").fill("Court of the JMFC, Saket");
    await page.getByRole("button", { name: "Save & track deadlines" }).click();
    await page.waitForURL(/\/dashboard\/rights-clock\/[0-9a-f-]{36}$/, { timeout: 30_000 });

    // ---- Detail page ----
    await expect(page.getByRole("heading", { name: "Ravi Kumar" })).toBeVisible();
    await expect(page.getByText("FIR 0123/2026", { exact: false })).toBeVisible();
    await expect(page.getByText("Rights every arrested person has")).toBeVisible();
    await expect(page.getByText("Kapil Wadhawan", { exact: false }).first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rights-clock-detail.png`, fullPage: true });

    // ---- Download the default bail application ----
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Default bail application/ }).click(),
    ]);
    const file = await download.path();
    expect(readFileSync(file!).subarray(0, 5).toString()).toBe("%PDF-");
    expect(download.suggestedFilename()).toBe("legalsetu-default-bail-draft.pdf");

    // ---- Record the chargesheet (filed yesterday, after the right arose) ----
    await page.getByLabel("Chargesheet filed?").fill(istDate(-1));
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText("survives only if bail was applied for", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Chargesheet recorded as filed on", { exact: false })).toBeVisible();

    // ---- It shows up in the list and in My Cases ----
    await page.getByRole("link", { name: "All trackers" }).click();
    await expect(page.getByRole("link", { name: /Ravi Kumar/ }).first()).toBeVisible();
    await page.goto(`${BASE}/dashboard/cases`);
    await expect(page.getByText("Custody — Ravi Kumar").first()).toBeVisible();
  });
});
