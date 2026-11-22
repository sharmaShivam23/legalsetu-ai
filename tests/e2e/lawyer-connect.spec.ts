// ==========================================================
// Verified Lawyer Connect — end-to-end through the real UI, with four
// people in separate browser sessions: a citizen, a demo advocate,
// a brand-new advocate, and an admin.
//
// Needs a running server whose DB has: the demo advocates
// (npm run lawyers:seed), a citizen with a case, an ADMIN, and a
// verified-email LAWYER account without a profile:
//   E2E_BASE_URL  E2E_EMAIL  E2E_PASSWORD
//   E2E_ADMIN_EMAIL  E2E_NEW_ADVOCATE_EMAIL  E2E_DEMO_LAWYER_PASSWORD
// Skipped unless E2E_ADMIN_EMAIL is set.
// ==========================================================

import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const CITIZEN = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const ADMIN = process.env.E2E_ADMIN_EMAIL;
const NEW_ADVOCATE = process.env.E2E_NEW_ADVOCATE_EMAIL ?? "";
const DEMO_PASSWORD = process.env.E2E_DEMO_LAWYER_PASSWORD ?? "";
const SHOTS = process.env.E2E_SCREENSHOT_DIR;
const SAKET = { latitude: 28.5245, longitude: 77.2066 };

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function session(browser: Browser, email: string, password: string): Promise<Page> {
  const ctx = await browser.newContext({
    geolocation: SAKET,
    permissions: ["geolocation"],
    viewport: { width: 1366, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.describe.serial("Verified Lawyer Connect", () => {
  test.skip(!ADMIN, "E2E_ADMIN_EMAIL not set");
  test.setTimeout(180_000);

  let consultationUrl = "";

  test("sign-up asks for the address, with 'Use my current location'", async ({ browser }) => {
    const ctx = await browser.newContext({ geolocation: SAKET, permissions: ["geolocation"], viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/register`);
    await page.getByPlaceholder("John Doe").fill("Signup Address Test");
    await page.getByPlaceholder("name@example.com").fill(process.env.E2E_SIGNUP_EMAIL ?? `signup-${Date.now()}@example.com`);
    await page.getByPlaceholder("At least 8 characters").fill("Str0ngPassw0rd!");

    // Without an address the form refuses.
    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.getByText("Please enter your address, or use your current location.")).toBeVisible();

    // The button fills the address and PIN code from the browser's location.
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByText("Current location attached")).toBeVisible({ timeout: 20_000 });
    const address = page.getByLabel("Address (house, street, area, city)");
    await expect(address).not.toHaveValue("", { timeout: 15_000 });
    const pin = page.getByLabel("PIN code");
    if ((await pin.inputValue()) === "") await pin.fill("110017"); // if the map service gave no postcode
    await shot(page, "lc-0-signup-address");

    await page.getByRole("button", { name: /Create Account/ }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  test("citizen finds a nearby advocate, filters, and sends a request with a shared case", async ({ browser }) => {
    const page = await session(browser, CITIZEN, PASSWORD);
    await page.getByRole("link", { name: "Find a Lawyer" }).first().click();
    await expect(page.getByRole("heading", { name: "Find a Lawyer" })).toBeVisible();

    // Location: the browser's GPS (Saket), rounded server-side.
    await page.getByRole("button", { name: /^(Add address|Change location)$/ }).click();
    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByText(/^Nearest to /)).toBeVisible({ timeout: 20_000 });

    // Nearest first; everyone listed is verified; demo profiles are labelled.
    const cards = page.locator('section[aria-label="Advocates"] a[href^="/dashboard/lawyers/"]');
    await expect(cards.first()).toContainText("Meera Sharma", { timeout: 15_000 });
    await expect(cards.first()).toContainText("Demo profile");
    await expect(cards.first()).toContainText("Verified");
    // Default: ALL distances, nearest first — Gurugram and Noida included.
    await expect(page.getByText(/verified advocates? · nearest first/)).toBeVisible();
    await expect(page.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('section[aria-label="Advocates"]')).toContainText("Anjali Verma");
    // The map rendered with real tiles.
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
    // Real map tiles downloaded (needs internet; the tile host is configurable).
    await expect.poll(() => page.locator(".leaflet-tile-loaded").count(), { timeout: 20_000 }).toBeGreaterThan(3);
    await shot(page, "lc-1-find-a-lawyer");

    // The distance filter narrows it: Gurugram is outside 10 km.
    await page.getByRole("radio", { name: "10 km" }).click();
    await expect(page.getByText(/verified advocates? within 10 km/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('section[aria-label="Advocates"]')).not.toContainText("Anjali Verma");
    await page.getByRole("radio", { name: "All" }).click();
    await expect(page.locator('section[aria-label="Advocates"]')).toContainText("Anjali Verma", { timeout: 15_000 });

    // Language filter: Tamil.
    await page.getByRole("button", { name: /Filters/ }).click();
    // The filter's language <select> (the sidebar also has a language switcher).
    await page.locator("select").filter({ has: page.locator('option[value="ta"]') }).selectOption("ta");
    await expect(cards).toHaveCount(1, { timeout: 15_000 });
    await expect(cards.first()).toContainText("Lakshmi Iyer");
    await page.getByRole("button", { name: "Clear filters" }).click();

    // Profile → request with consent to share the Rights Clock case.
    await cards.filter({ hasText: "Meera Sharma" }).first().click();
    await expect(page.getByRole("heading", { name: "Meera Sharma" })).toBeVisible();
    await expect(page.getByText("fictional demo profile")).toBeVisible();
    await expect(page.getByText("DEMO/0001/2012")).toBeVisible();
    await shot(page, "lc-2-lawyer-profile");
    await page.getByRole("button", { name: "Request a consultation" }).click();
    await page.getByRole("button", { name: /Urgent/ }).click();
    await page.getByLabel(/What happened/).fill("My brother Sunil was arrested 56 days ago under BNS 303(2). No chargesheet yet. We need bail.");
    await page.getByLabel(/Share a case file/).selectOption({ label: "Custody — Sunil Kumar" });
    await page.getByLabel(/I agree to let Meera Sharma read this case/).check();
    await page.getByRole("button", { name: "Send request" }).click();
    await page.waitForURL(/\/dashboard\/consultations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    consultationUrl = page.url();
    await expect(page.getByText("Waiting for reply").first()).toBeVisible();
    await expect(page.getByText("Messaging opens when the advocate accepts your request.")).toBeVisible();
    await shot(page, "lc-3-request-sent");
    await page.context().close();
  });

  test("the advocate sees the request, the client's Rights Clock, accepts and replies", async ({ browser }) => {
    const page = await session(browser, "meera.sharma@legalsetu-demo.example", DEMO_PASSWORD);
    await page.getByRole("link", { name: "Client Desk" }).click();
    await expect(page.getByRole("heading", { name: "Client Desk" })).toBeVisible();
    // The shared case's default-bail date (5 days away) is on the desk.
    const deadlines = page.locator('section[aria-label="Client deadlines"]');
    await expect(deadlines).toContainText("Sunil Kumar — Default bail (60-day period)");
    await expect(deadlines.getByText("5", { exact: true })).toBeVisible();
    await expect(page.locator('section[aria-label="New requests"]')).toContainText("Case file shared");
    await shot(page, "lc-4-client-desk");

    await page.goto(consultationUrl);
    await expect(page.getByText("What the client wrote")).toBeVisible();
    await page.getByRole("button", { name: "Open case file" }).click();
    await expect(page.getByText("Rights Clock — Sunil Kumar")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Default bail arises on .* in 5 days/).first()).toBeVisible();
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Active").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("textbox", { name: "Message" }).fill("I have read the Rights Clock. I will file the default bail application today.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator('section[aria-label="Messages"]')).toContainText("file the default bail application today");
    await shot(page, "lc-5-advocate-thread");
    await page.context().close();
  });

  test("the citizen sees the reply and answers", async ({ browser }) => {
    const page = await session(browser, CITIZEN, PASSWORD);
    await page.goto(consultationUrl);
    await expect(page.locator('section[aria-label="Messages"]')).toContainText("file the default bail application today", { timeout: 15_000 });
    await page.getByRole("textbox", { name: "Message" }).fill("Thank you! The remand order is dated 1 Sep.");
    await page.keyboard.press("Enter");
    await expect(page.locator('section[aria-label="Messages"]')).toContainText("remand order is dated");
    await shot(page, "lc-6-citizen-thread");
    await page.context().close();
  });

  test("a new advocate completes onboarding and submits for verification", async ({ browser }) => {
    const page = await session(browser, NEW_ADVOCATE, PASSWORD);
    await expect(page.getByRole("link", { name: "Advocate Profile" })).toBeVisible();
    await page.getByRole("link", { name: "Advocate Profile" }).click();
    await expect(page.getByText("Verification status")).toBeVisible();

    await page.getByLabel(/Full name exactly as on your enrolment certificate/).fill("Rekha Joshi");
    await page.getByLabel(/State Bar Council/).selectOption("DL");
    await page.getByLabel(/Enrolment number/).fill("D/4321/2018");
    await page.getByLabel(/Year of enrolment/).fill("2018");
    await page.getByRole("group", { name: "Practice areas" }).getByRole("button", { name: "Criminal & Bail" }).click();
    await page.getByRole("group", { name: "Courts" }).getByRole("button", { name: "District & Sessions Court" }).click();
    await page.getByRole("group", { name: "Languages" }).getByRole("button", { name: "Hindi" }).click();

    // Rule 36 is enforced as you type.
    await page.getByLabel(/Short factual note/).fill("Best bail lawyer, 100% success");
    await expect(page.getByText(/does not allow advertising/)).toBeVisible();
    await page.getByLabel(/Short factual note/).fill("Bail matters at Saket District Court since 2018.");

    await page.getByLabel(/Chamber \/ office address/).fill("Chamber 9, Saket District Court");
    await page.getByLabel(/^City/).fill("New Delhi");
    await page.getByLabel(/PIN code/).fill("110017");
    await page.getByRole("button", { name: /at my office now/ }).click(); // GPS → Saket
    await expect(page.locator('[aria-label="Pick your office location"] .leaflet-marker-icon')).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible({ timeout: 15_000 });

    await page.locator('section[aria-label="Profile photo"] input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible({ timeout: 15_000 });
    const docInputs = page.locator('section[aria-label="Verification documents"] input[type="file"]');
    const files = [
      { name: "enrolment.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "practice.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "pan.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "selfie.png", mimeType: "image/png", buffer: PNG_1PX },
    ];
    for (let i = 0; i < files.length; i++) {
      await docInputs.nth(i).setInputFiles(files[i]);
      await expect(page.locator('section[aria-label="Verification documents"]').getByRole("link", { name: "View" })).toHaveCount(i + 1, { timeout: 15_000 });
    }
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await expect(page.getByText("Under review").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "lc-7-advocate-onboarding");
    await page.context().close();
  });

  test("an admin reviews the documents and approves; the advocate becomes findable", async ({ browser }) => {
    const page = await session(browser, ADMIN!, PASSWORD);
    await page.getByRole("link", { name: "Verify Lawyers" }).click();
    await page.getByRole("link", { name: /Rekha Joshi/ }).click();
    await expect(page.getByText("Automatic checks")).toBeVisible();
    await expect(page.locator('section[aria-label="Automatic checks"] [aria-label="Failed"]')).toHaveCount(0);
    await expect(page.locator('section[aria-label="Documents"]').getByText("Open PDF")).toHaveCount(3);
    await shot(page, "lc-8-admin-review");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Saved: now verified.")).toBeVisible({ timeout: 15_000 });
    await page.context().close();

    const citizen = await session(browser, CITIZEN, PASSWORD);
    await citizen.goto(`${BASE}/dashboard/lawyers`);
    await expect(citizen.locator('section[aria-label="Advocates"]')).toContainText("Rekha Joshi", { timeout: 15_000 });
    await citizen.context().close();
  });
});
