import { test, Page } from "@playwright/test";
import path from "path";

const BASE = "http://localhost:5179";
const SCREENSHOTS = path.join(__dirname, "screenshots");

async function login(page: Page) {
  await page.goto(BASE + "/login");
  await page.waitForLoadState("networkidle");

  // If already redirected to dashboard, skip
  if (page.url().includes("/dashboard")) return;

  await page.locator("#email").fill("ananya@technova.in");
  await page.locator("#password").fill("Welcome@123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

async function screenshotPage(page: Page, url: string, filename: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(SCREENSHOTS, filename),
    fullPage: true,
  });
}

test("Capture all EMP Recruit feature screenshots", async ({ page }) => {
  test.setTimeout(180000);

  await login(page);

  // 1. Dashboard with stats
  await screenshotPage(page, BASE + "/dashboard", "recruit-01-dashboard.png");

  // 2. Job List
  await screenshotPage(page, BASE + "/jobs", "recruit-02-jobs.png");

  // 3. Job Detail with pipeline - click first job title in the table
  await page.goto(BASE + "/jobs");
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("table tbody tr", { timeout: 10000 });
  await page.locator("table tbody tr").first().locator("a").first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(SCREENSHOTS, "recruit-03-job-detail.png"),
    fullPage: true,
  });

  // 4. Candidates list
  await screenshotPage(page, BASE + "/candidates", "recruit-04-candidates.png");

  // 5. Interviews list
  await screenshotPage(page, BASE + "/interviews", "recruit-05-interviews.png");

  // 6. Interview Detail - click first View link in table
  await page.goto(BASE + "/interviews");
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("table tbody tr", { timeout: 10000 });
  const viewLink = page.locator("table tbody tr").first().locator("a").filter({ hasText: "View" });
  await viewLink.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(SCREENSHOTS, "recruit-06-interview-detail.png"),
    fullPage: true,
  });

  // 7. Offers list
  await screenshotPage(page, BASE + "/offers", "recruit-07-offers.png");

  // 8. Analytics
  await screenshotPage(page, BASE + "/analytics", "recruit-08-analytics.png");

  // 9. Settings
  await screenshotPage(page, BASE + "/settings", "recruit-09-settings.png");
});
