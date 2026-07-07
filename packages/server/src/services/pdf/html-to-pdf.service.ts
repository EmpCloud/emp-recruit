// ============================================================================
// HTML → PDF — renders an HTML string to a real, print-quality PDF using a
// headless Chromium (puppeteer). Used for offer letters and any other document
// that must be a genuine PDF (not HTML masquerading as one).
//
// A single browser instance is reused across renders for performance and is
// lazily launched on first use.
// ============================================================================

import type { Browser } from "puppeteer";
import { logger } from "../../utils/logger";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const puppeteer = (await import("puppeteer")).default;
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    logger.info("PDF engine: headless Chromium launched");
  }
  return browserPromise;
}

/**
 * Render an HTML document to a PDF buffer (A4, print backgrounds on).
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// Best-effort cleanup on shutdown.
async function shutdown() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      /* ignore */
    }
    browserPromise = null;
  }
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
