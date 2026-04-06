// =============================================================================
// EMP-RECRUIT: Final coverage push - Real DB tests for uncovered services
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import knexLib, { Knex } from "knex";

let db: Knex;
const ORG = 5;
const USER = 522;

beforeAll(async () => {
  db = knexLib({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_recruit" } });
  await db.raw("SELECT 1");
});

afterAll(async () => { await db.destroy(); });

describe("Offer service coverage", () => {
  it("listOffers returns results", async () => { const { listOffers } = await import("../../services/offer/offer.service"); const r = await listOffers(ORG, {}); expect(r).toHaveProperty("data"); });
  it("getOffer throws for non-existent", async () => { const { getOffer } = await import("../../services/offer/offer.service"); await expect(getOffer(ORG, "non-existent-id")).rejects.toThrow(); });
  it("updateOffer throws for non-existent", async () => { const { updateOffer } = await import("../../services/offer/offer.service"); await expect(updateOffer(ORG, "non-existent-id", { salary: 100 } as any)).rejects.toThrow(); });
  it("sendOffer throws for non-existent", async () => { const { sendOffer } = await import("../../services/offer/offer.service"); await expect(sendOffer(ORG, "non-existent-id")).rejects.toThrow(); });
  it("revokeOffer throws for non-existent", async () => { const { revokeOffer } = await import("../../services/offer/offer.service"); await expect(revokeOffer(ORG, "non-existent-id")).rejects.toThrow(); });
  it("acceptOffer throws for non-existent", async () => { const { acceptOffer } = await import("../../services/offer/offer.service"); await expect(acceptOffer(ORG, "non-existent-id")).rejects.toThrow(); });
  it("declineOffer throws for non-existent", async () => { const { declineOffer } = await import("../../services/offer/offer.service"); await expect(declineOffer(ORG, "non-existent-id")).rejects.toThrow(); });
});

describe("Offer letter service coverage", () => {
  it("listLetterTemplates", async () => { const { listLetterTemplates } = await import("../../services/offer/offer-letter.service"); const r = await listLetterTemplates(ORG); expect(Array.isArray(r)).toBe(true); });
  it("getOfferLetter throws for non-existent", async () => { const { getOfferLetter } = await import("../../services/offer/offer-letter.service"); await expect(getOfferLetter(ORG, "non-existent-id")).rejects.toThrow(); });
});

describe("Application service coverage", () => {
  it("listApplications returns results", async () => { const { listApplications } = await import("../../services/application/application.service"); const r = await listApplications(ORG, {}); expect(r).toHaveProperty("data"); });
  it("getApplication throws for non-existent", async () => { const { getApplication } = await import("../../services/application/application.service"); await expect(getApplication(ORG, "non-existent-id")).rejects.toThrow(); });
  it("getTimeline returns array", async () => { const { getTimeline } = await import("../../services/application/application.service"); const r = await getTimeline(ORG, "non-existent-id"); expect(Array.isArray(r)).toBe(true); });
});

describe("Assessment service coverage", () => {
  it("listTemplates returns results", async () => { const { listTemplates } = await import("../../services/assessment/assessment.service"); const r = await listTemplates(ORG); expect(r).toBeTruthy(); });
  it("getTemplate throws for non-existent", async () => { const { getTemplate } = await import("../../services/assessment/assessment.service"); await expect(getTemplate(ORG, "non-existent-id")).rejects.toThrow(); });
  it("getAssessmentResults throws for non-existent", async () => { const { getAssessmentResults } = await import("../../services/assessment/assessment.service"); await expect(getAssessmentResults(ORG, "non-existent-id")).rejects.toThrow(); });
});

describe("Background check service coverage", () => {
  it("listPackages returns results", async () => { const { listPackages } = await import("../../services/background-check/background-check.service"); const r = await listPackages(ORG); expect(r).toBeTruthy(); });
  it("getCheck throws for non-existent", async () => { const { getCheck } = await import("../../services/background-check/background-check.service"); await expect(getCheck(ORG, "non-existent-id")).rejects.toThrow(); });
  it("listAllChecks returns results", async () => { const { listAllChecks } = await import("../../services/background-check/background-check.service"); const r = await listAllChecks(ORG, {}); expect(r).toHaveProperty("data"); });
});

describe("Career page service coverage", () => {
  it("getConfig returns result", async () => { const { getConfig } = await import("../../services/career-page/career-page.service"); const r = await getConfig(ORG); expect(r === null || typeof r === "object").toBe(true); });
  it("getPublicCareerPage throws for non-existent", async () => { const { getPublicCareerPage } = await import("../../services/career-page/career-page.service"); await expect(getPublicCareerPage("non-existent-slug")).rejects.toThrow(); });
  it("getPublicJobs throws for non-existent", async () => { const { getPublicJobs } = await import("../../services/career-page/career-page.service"); await expect(getPublicJobs("non-existent-slug")).rejects.toThrow(); });
  it("getPublicJobDetail throws for non-existent", async () => { const { getPublicJobDetail } = await import("../../services/career-page/career-page.service"); await expect(getPublicJobDetail("non-existent-slug", "bad-job")).rejects.toThrow(); });
});

describe("Interview service coverage", () => {
  it("listInterviews returns results", async () => { const { listInterviews } = await import("../../services/interview/interview.service"); const r = await listInterviews(ORG, {}); expect(r).toHaveProperty("data"); });
  it("getInterview throws for non-existent", async () => { const { getInterview } = await import("../../services/interview/interview.service"); await expect(getInterview(ORG, "non-existent-id")).rejects.toThrow(); });
  it("changeStatus throws for non-existent", async () => { const { changeStatus } = await import("../../services/interview/interview.service"); await expect(changeStatus(ORG, "non-existent-id", "completed")).rejects.toThrow(); });
  it("updateInterview throws for non-existent", async () => { const { updateInterview } = await import("../../services/interview/interview.service"); await expect(updateInterview(ORG, "non-existent-id", {} as any)).rejects.toThrow(); });
  it("getFeedback returns array", async () => { const { getFeedback } = await import("../../services/interview/interview.service"); const r = await getFeedback(ORG, "non-existent-id"); expect(Array.isArray(r)).toBe(true); });
  it("getAggregatedFeedback returns results", async () => { const { getAggregatedFeedback } = await import("../../services/interview/interview.service"); const r = await getAggregatedFeedback(ORG, "non-existent-candidate"); expect(r).toBeTruthy(); });
});

describe("Onboarding service coverage", () => {
  it("listTemplates returns results", async () => { const { listTemplates } = await import("../../services/onboarding/onboarding.service"); const r = await listTemplates(ORG); expect(r).toBeTruthy(); });
  it("getChecklist throws for non-existent", async () => { const { getChecklist } = await import("../../services/onboarding/onboarding.service"); await expect(getChecklist(ORG, "non-existent-id")).rejects.toThrow(); });
  it("listChecklists returns results", async () => { const { listChecklists } = await import("../../services/onboarding/onboarding.service"); const r = await listChecklists(ORG, {}); expect(r).toHaveProperty("data"); });
});

describe("Portal service coverage", () => {
  it("generatePortalToken returns string", async () => { const { generatePortalToken } = await import("../../services/portal/portal.service"); const t = generatePortalToken("c1", ORG, "t@t.com"); expect(typeof t).toBe("string"); });
  it("getUpcomingInterviews returns array", async () => { const { getUpcomingInterviews } = await import("../../services/portal/portal.service"); const r = await getUpcomingInterviews(ORG, "non-existent-id"); expect(Array.isArray(r)).toBe(true); });
  it("getPendingOffers returns array", async () => { const { getPendingOffers } = await import("../../services/portal/portal.service"); const r = await getPendingOffers(ORG, "non-existent-id"); expect(Array.isArray(r)).toBe(true); });
});

describe("Referral service coverage", () => {
  it("listReferrals returns results", async () => { const { listReferrals } = await import("../../services/referral/referral.service"); const r = await listReferrals(ORG, {}); expect(r).toHaveProperty("data"); });
  it("updateReferralStatus throws for non-existent", async () => { const { updateReferralStatus } = await import("../../services/referral/referral.service"); await expect(updateReferralStatus(ORG, "non-existent-id", "hired")).rejects.toThrow(); });
});

describe("Scoring service coverage", () => {
  it("extractSkills returns skills", async () => { const { extractSkills } = await import("../../services/scoring/resume-scoring.service"); const skills = extractSkills("JavaScript React Node.js TypeScript Python Docker AWS Kubernetes MongoDB"); expect(skills.length).toBeGreaterThan(0); });
  it("extractSkills empty", async () => { const { extractSkills } = await import("../../services/scoring/resume-scoring.service"); expect(extractSkills("")).toHaveLength(0); });
  it("getScoreReport throws for non-existent", async () => { const { getScoreReport } = await import("../../services/scoring/resume-scoring.service"); await expect(getScoreReport(ORG, "non-existent-id")).rejects.toThrow(); });
  it("getJobRankings returns results", async () => { const { getJobRankings } = await import("../../services/scoring/resume-scoring.service"); const r = await getJobRankings(ORG, "non-existent-job"); expect(r).toBeTruthy(); });
});

describe("Calendar service coverage", () => {
  it("getCalendarLinks returns links", async () => { const { getCalendarLinks } = await import("../../services/interview/calendar.service"); const links = getCalendarLinks({ title: "Interview", start: "2026-05-01T10:00:00Z", end: "2026-05-01T11:00:00Z", description: "Tech", location: "Zoom" } as any); expect(links).toBeTruthy(); });
  it("generateICSFile returns ICS", async () => { const { generateICSFile } = await import("../../services/interview/calendar.service"); const ics = generateICSFile({ title: "Interview", start: "2026-05-01T10:00:00Z", end: "2026-05-01T11:00:00Z", description: "Tech", location: "Zoom" } as any); expect(ics).toContain("VCALENDAR"); });
});
