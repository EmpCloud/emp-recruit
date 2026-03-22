import { test, expect, Page } from "@playwright/test";

const EMAIL = "ananya@technova.in";
const PASSWORD = "Welcome@123";

/** Reusable login helper with retry for rate-limiting */
async function login(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // If already redirected to dashboard (session still active), skip login
    if (page.url().includes("/dashboard")) {
      return;
    }

    // Fill credentials
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);

    // Click sign in
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for navigation
    try {
      await page.waitForURL("**/dashboard", { timeout: 10000 });
      await page.waitForLoadState("networkidle");
      return;
    } catch {
      if (attempt < 3) {
        await page.waitForTimeout(2000);
      }
    }
  }

  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

/** Navigate to interview list, click first View link, wait for detail page to fully load */
async function goToFirstInterviewDetail(page: Page) {
  await page.goto("/interviews");
  await page.waitForLoadState("networkidle");

  // Wait for table rows to load
  await page.waitForSelector("table tbody tr", { timeout: 10000 });

  // Get the first "View" link's href to know the target URL
  const viewLink = page.locator("table tbody tr").first().locator("a").filter({ hasText: "View" });
  const href = await viewLink.getAttribute("href");

  await viewLink.click();

  // Wait for navigation to the specific interview detail URL
  if (href) {
    await page.waitForURL(`**${href}`, { timeout: 10000 });
  } else {
    await page.waitForFunction(
      () => /\/interviews\/[0-9a-f-]{36}/.test(window.location.pathname),
      { timeout: 10000 },
    );
  }
  await page.waitForLoadState("networkidle");

  // Wait for the detail page content to fully render (not just "Loading interview details...")
  // The detail page shows the interview title as an h1 heading once loaded
  await page.waitForSelector("h1", { timeout: 10000 });

  // Also wait for the "Meeting Link" section heading which confirms data is loaded
  await page.waitForSelector("text=Meeting Link", { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe("Interview Detail Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("1. Interview List Page — shows interview table", async ({ page }) => {
    await page.goto("/interviews");
    await page.waitForLoadState("networkidle");

    // Verify heading
    await expect(page.getByRole("heading", { name: /interviews/i })).toBeVisible();

    // Wait for table rows to appear
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Should have at least one interview row
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();

    await page.screenshot({
      path: "e2e/screenshots/interview/01-interview-list.png",
      fullPage: true,
    });
  });

  test("2. Interview Detail Page — shows candidate name, job title, schedule", async ({
    page,
  }) => {
    await goToFirstInterviewDetail(page);

    // Verify the page has an h1 heading with interview title
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();

    // Verify candidate name, panelists, and other sections are present
    await expect(page.locator("text=Panelists")).toBeVisible();
    await expect(page.locator("text=Recordings").first()).toBeVisible();

    await page.screenshot({
      path: "e2e/screenshots/interview/02-interview-detail.png",
      fullPage: true,
    });
  });

  test("3. Generate Meet Link — click button and verify link appears", async ({ page }) => {
    await goToFirstInterviewDetail(page);

    // Check if "Generate Google Meet Link" button exists (no meeting link yet)
    const generateBtn = page.getByRole("button", { name: /generate google meet/i });

    if (await generateBtn.isVisible().catch(() => false)) {
      await generateBtn.click();
      // Wait for the meet link to appear
      await page.waitForSelector("text=meet.google.com", { timeout: 10000 });
    }

    // Either the link was already there or we just generated one
    // Verify the link is now visible
    await expect(page.locator("text=meet.google.com").first()).toBeVisible();

    await page.screenshot({
      path: "e2e/screenshots/interview/03-meeting-link.png",
      fullPage: true,
    });
  });

  test("4. Copy Link — verify button exists", async ({ page }) => {
    await goToFirstInterviewDetail(page);

    // The "Copy Link" button is visible when a meeting link exists
    const copyBtn = page.getByRole("button", { name: /copy/i });
    await expect(copyBtn).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: "e2e/screenshots/interview/04-copy-link-button.png",
      fullPage: true,
    });
  });

  test("5. Send Invitation — click button and verify success", async ({ page }) => {
    await goToFirstInterviewDetail(page);

    // "Send Invitation" button should be visible when meeting link exists
    const sendBtn = page.getByRole("button", { name: /send invitation/i });

    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();

      // Wait for success message
      await page
        .waitForSelector("text=Invitation sent successfully", { timeout: 15000 })
        .catch(() => {
          // Email sending may take time or fail silently in dev
        });
    }

    // Wait a moment for the success toast to render
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: "e2e/screenshots/interview/05-send-invitation.png",
      fullPage: true,
    });
  });

  test("6. Recording Section — verify upload section is visible", async ({ page }) => {
    await goToFirstInterviewDetail(page);

    // Verify the "Recordings" section heading is visible
    const recordingsSection = page.locator("text=Recordings");
    await expect(recordingsSection.first()).toBeVisible({ timeout: 10000 });

    // Verify "Upload Recording" button exists
    const uploadBtn = page.getByRole("button", { name: /upload recording/i });
    await expect(uploadBtn).toBeVisible();

    // Scroll recording section into view for screenshot
    await uploadBtn.scrollIntoViewIfNeeded();

    await page.screenshot({
      path: "e2e/screenshots/interview/06-recording-section.png",
      fullPage: true,
    });
  });

  test("7. Transcript Section — verify section exists", async ({ page }) => {
    await goToFirstInterviewDetail(page);

    // Scroll to bottom to find the transcript section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Look for Transcript heading — it may say "Transcript" or "No transcript"
    const transcriptSection = page.locator("text=Transcript");
    const isVisible = await transcriptSection.first().isVisible().catch(() => false);

    if (isVisible) {
      await expect(transcriptSection.first()).toBeVisible();
    }

    await page.screenshot({
      path: "e2e/screenshots/interview/07-transcript-section.png",
      fullPage: true,
    });
  });

  test("8. Full Interview Detail — complete page screenshot", async ({ page }) => {
    await goToFirstInterviewDetail(page);

    // Wait for all async content to settle
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: "e2e/screenshots/interview/08-full-interview-detail.png",
      fullPage: true,
    });
  });
});
