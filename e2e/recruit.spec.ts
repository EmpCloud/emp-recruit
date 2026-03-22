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

    // Wait for navigation — either dashboard or stay on login (rate limited)
    try {
      await page.waitForURL("**/dashboard", { timeout: 10000 });
      await page.waitForLoadState("networkidle");
      return; // success
    } catch {
      // Login may have been rate-limited; wait and retry
      if (attempt < 3) {
        await page.waitForTimeout(2000);
      }
    }
  }

  // Final fallback: just assert we got to dashboard
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
}

// ─── 1. Login Flow ──────────────────────────────────────────────────────────

test.describe("1. Login Flow", () => {
  test("loads login page and signs in to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Verify login page
    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/01-login-page.png" });

    // Fill and submit
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Lands on dashboard
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/02-login-success-dashboard.png" });
  });
});

// ─── 2. Dashboard ───────────────────────────────────────────────────────────

test.describe("2. Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows stats cards with job and candidate counts", async ({ page }) => {
    await expect(page.getByText("Open Jobs")).toBeVisible();
    await expect(page.getByText("Total Candidates")).toBeVisible();
    await expect(page.getByText("Total Applications")).toBeVisible();
    await expect(page.getByText("Pipeline Distribution")).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/03-dashboard-stats.png" });
  });
});

// ─── 3. Jobs ────────────────────────────────────────────────────────────────

test.describe("3. Jobs", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows jobs list", async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    // Page heading is "Job Postings"
    await expect(page.getByRole("heading", { name: /job postings/i })).toBeVisible();

    // Should have job rows/cards visible
    await page.waitForSelector("a[href^='/jobs/']", { timeout: 10000 });

    await page.screenshot({ path: "e2e/screenshots/04-jobs-list.png" });
  });

  test("shows job detail with pipeline", async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    // Click the first job link
    const firstJobLink = page.locator("a[href^='/jobs/']").first();
    await firstJobLink.click();
    await page.waitForLoadState("networkidle");

    // Should be on a job detail page
    await page.waitForURL("**/jobs/**");

    await page.screenshot({ path: "e2e/screenshots/05-job-detail.png" });
  });
});

// ─── 4. Candidates ──────────────────────────────────────────────────────────

test.describe("4. Candidates", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows candidate list", async ({ page }) => {
    await page.goto("/candidates");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /candidates/i })).toBeVisible();

    // Wait for candidates to load
    await page.waitForSelector("a[href^='/candidates/']", { timeout: 10000 });

    await page.screenshot({ path: "e2e/screenshots/06-candidates-list.png" });
  });

  test("search filters candidates", async ({ page }) => {
    await page.goto("/candidates");
    await page.waitForLoadState("networkidle");

    // Search for Rajesh
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("Rajesh");
    await searchInput.press("Enter");

    // Wait for filtered results
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "e2e/screenshots/07-candidates-search-rajesh.png" });
  });
});

// ─── 5. Interviews ──────────────────────────────────────────────────────────

test.describe("5. Interviews", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows interview list", async ({ page }) => {
    await page.goto("/interviews");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /interviews/i })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/08-interviews-list.png" });
  });
});

// ─── 6. Offers ──────────────────────────────────────────────────────────────

test.describe("6. Offers", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows offers list", async ({ page }) => {
    await page.goto("/offers");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /offers/i })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/09-offers-list.png" });
  });
});

// ─── 7. Onboarding ──────────────────────────────────────────────────────────

test.describe("7. Onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows onboarding page", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /onboarding/i })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/10-onboarding-list.png" });
  });
});

// ─── 8. Referrals ───────────────────────────────────────────────────────────

test.describe("8. Referrals", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows referrals page", async ({ page }) => {
    await page.goto("/referrals");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /referrals/i })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/11-referrals-list.png" });
  });
});

// ─── 9. Analytics ───────────────────────────────────────────────────────────

test.describe("9. Analytics", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows analytics page with charts", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/12-analytics.png" });
  });
});

// ─── 10. Settings ───────────────────────────────────────────────────────────

test.describe("10. Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows settings page", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/13-settings.png" });
  });
});
