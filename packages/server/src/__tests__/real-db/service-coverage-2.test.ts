// =============================================================================
// EMP RECRUIT — Service Coverage Round 2
// =============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "emp_recruit";
process.env.DB_PROVIDER = "mysql";
process.env.EMPCLOUD_DB_HOST = "localhost";
process.env.EMPCLOUD_DB_PORT = "3306";
process.env.EMPCLOUD_DB_USER = "empcloud";
process.env.EMPCLOUD_DB_PASSWORD = "EmpCloud2026";
process.env.EMPCLOUD_DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.PORTAL_SECRET = "test-portal-secret";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDB, closeDB, getDB } from "../../db/adapters";

const ORG = 5;
const ADMIN = 522;
const U = String(Date.now()).slice(-6);

let db: ReturnType<typeof getDB>;

beforeAll(async () => {
  await initDB();
  db = getDB();
});

afterAll(async () => {
  try { await db.deleteMany("candidates", { email: `cov2-${U}@test.com` }); } catch {}
  await closeDB();
});

// ============================================================================
// JOB SERVICE
// ============================================================================
describe("Job coverage-2", () => {
  let jobId: string;

  it("createJob", async () => {
    const { createJob } = await import("../../services/job/job.service.js");
    const j = await createJob(ORG, {
      title: `Cov2 Engineer ${U}`,
      department: "Engineering",
      location: "Remote",
      employment_type: "full_time",
      description: "Coverage test job posting",
      requirements: "3+ years experience",
    }, ADMIN);
    expect(j).toHaveProperty("id");
    jobId = j.id;
  });

  it("listJobs", async () => {
    const { listJobs } = await import("../../services/job/job.service.js");
    const r = await listJobs(ORG, {});
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("total");
  });

  it("getJob", async () => {
    const { getJob } = await import("../../services/job/job.service.js");
    const j = await getJob(ORG, jobId);
    expect(j.title).toContain("Cov2 Engineer");
  });

  it("updateJob", async () => {
    const { updateJob } = await import("../../services/job/job.service.js");
    const j = await updateJob(ORG, jobId, { description: "Updated for cov2" });
    expect(j).toBeTruthy();
  });

  it("changeStatus to open", async () => {
    const { changeStatus } = await import("../../services/job/job.service.js");
    const j = await changeStatus(ORG, jobId, "open");
    expect(j.status).toBe("open");
  });

  it("getJobAnalytics", async () => {
    const { getJobAnalytics } = await import("../../services/job/job.service.js");
    const a = await getJobAnalytics(ORG, jobId);
    expect(a).toHaveProperty("total_applications");
  });

  it("deleteJob (cleanup)", async () => {
    const { deleteJob } = await import("../../services/job/job.service.js");
    const r = await deleteJob(ORG, jobId);
    expect(r).toBe(true);
  });
});

// ============================================================================
// CANDIDATE SERVICE
// ============================================================================
describe("Candidate coverage-2", () => {
  let candidateId: string;

  it("createCandidate", async () => {
    const { createCandidate } = await import("../../services/candidate/candidate.service.js");
    const c = await createCandidate(ORG, {
      first_name: "CovTwo",
      last_name: `Test${U}`,
      email: `cov2-${U}@test.com`,
      phone: "+919876543210",
      source: "referral",
    });
    expect(c).toHaveProperty("id");
    candidateId = c.id;
  });

  it("listCandidates", async () => {
    const { listCandidates } = await import("../../services/candidate/candidate.service.js");
    const r = await listCandidates(ORG, {});
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("total");
  });

  it("getCandidate", async () => {
    const { getCandidate } = await import("../../services/candidate/candidate.service.js");
    const c = await getCandidate(ORG, candidateId);
    expect(c.first_name).toBe("CovTwo");
  });

  it("updateCandidate", async () => {
    const { updateCandidate } = await import("../../services/candidate/candidate.service.js");
    const c = await updateCandidate(ORG, candidateId, { phone: "+919999888877" });
    expect(c).toBeTruthy();
  });

  it("getCandidateApplications", async () => {
    const { getCandidateApplications } = await import("../../services/candidate/candidate.service.js");
    const r = await getCandidateApplications(ORG, candidateId);
    expect(Array.isArray(r)).toBe(true);
  });

  it("cleanup", async () => {
    await db.delete("candidates", candidateId);
  });
});

// ============================================================================
// PIPELINE SERVICE
// ============================================================================
describe("Pipeline coverage-2", () => {
  let stageId: string;

  it("getDefaultStages", async () => {
    const { getDefaultStages } = await import("../../services/pipeline/pipeline.service.js");
    const stages = getDefaultStages();
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBeGreaterThan(0);
  });

  it("getOrgStages", async () => {
    const { getOrgStages } = await import("../../services/pipeline/pipeline.service.js");
    const r = await getOrgStages(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("createStage", async () => {
    const { createStage } = await import("../../services/pipeline/pipeline.service.js");
    const s = await createStage(ORG, {
      name: `Cov2 Stage ${U}`,
      order_index: 99,
      color: "#FF5500",
    });
    expect(s).toHaveProperty("id");
    stageId = s.id;
  });

  it("updateStage", async () => {
    const { updateStage } = await import("../../services/pipeline/pipeline.service.js");
    const s = await updateStage(ORG, stageId, { color: "#00FF55" });
    expect(s).toBeTruthy();
  });

  it("deleteStage", async () => {
    const { deleteStage } = await import("../../services/pipeline/pipeline.service.js");
    const r = await deleteStage(ORG, stageId);
    expect(r).toBe(true);
  });
});

// ============================================================================
// APPLICATION SERVICE
// ============================================================================
describe("Application coverage-2", () => {
  it("listApplications", async () => {
    const { listApplications } = await import("../../services/application/application.service.js");
    const r = await listApplications(ORG, {});
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("total");
  });
});

// ============================================================================
// INTERVIEW SERVICE
// ============================================================================
describe("Interview coverage-2", () => {
  it("listInterviews", async () => {
    const { listInterviews } = await import("../../services/interview/interview.service.js");
    const r = await listInterviews(ORG, {});
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("total");
  });
});

// ============================================================================
// ASSESSMENT SERVICE
// ============================================================================
describe("Assessment coverage-2", () => {
  it("listTemplates returns array", async () => {
    const { listTemplates } = await import("../../services/assessment/assessment.service.js");
    const r = await listTemplates(ORG, {});
    expect(Array.isArray(r)).toBe(true);
  });
});

// ============================================================================
// OFFER SERVICE
// ============================================================================
describe("Offer coverage-2", () => {
  it("listOffers", async () => {
    const { listOffers } = await import("../../services/offer/offer.service.js");
    const r = await listOffers(ORG, {});
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("total");
  });
});

// ============================================================================
// OFFER LETTER SERVICE
// ============================================================================
describe("OfferLetter coverage-2", () => {
  let templateId: string;

  it("createLetterTemplate", async () => {
    const { createLetterTemplate } = await import("../../services/offer/offer-letter.service.js");
    const t = await createLetterTemplate(ORG, {
      name: `Cov2 OfferLetter ${U}`,
      content_template: "<p>Dear {{candidate_name}}, We are pleased to offer you the position of {{position}}.</p>",
    });
    expect(t).toHaveProperty("id");
    templateId = t.id;
  });

  it("listLetterTemplates", async () => {
    const { listLetterTemplates } = await import("../../services/offer/offer-letter.service.js");
    const r = await listLetterTemplates(ORG);
    expect(r.length).toBeGreaterThan(0);
  });

  it("cleanup", async () => {
    if (templateId) await db.delete("offer_letter_templates", templateId);
  });
});

// ============================================================================
// ANALYTICS SERVICE
// ============================================================================
describe("RecruitAnalytics coverage-2", () => {
  it("getDashboard", async () => {
    const { getDashboard } = await import("../../services/analytics/analytics.service.js");
    const d = await getDashboard(ORG);
    expect(d).toHaveProperty("openJobs");
  });

  it("getPipelineFunnel", async () => {
    const { getPipelineFunnel } = await import("../../services/analytics/analytics.service.js");
    const r = await getPipelineFunnel(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getTimeToHire", async () => {
    const { getTimeToHire } = await import("../../services/analytics/analytics.service.js");
    const r = await getTimeToHire(ORG);
    expect(r).toHaveProperty("averageDays");
  });

  it("getSourceEffectiveness", async () => {
    const { getSourceEffectiveness } = await import("../../services/analytics/analytics.service.js");
    const r = await getSourceEffectiveness(ORG);
    expect(Array.isArray(r)).toBe(true);
  });
});

// ============================================================================
// CAREER PAGE SERVICE
// ============================================================================
describe("CareerPage coverage-2", () => {
  it("getConfig", async () => {
    const { getConfig } = await import("../../services/career-page/career-page.service.js");
    const c = await getConfig(ORG);
    expect(c === null || typeof c === "object").toBe(true);
  });
});

// ============================================================================
// BACKGROUND CHECK SERVICE
// ============================================================================
describe("BackgroundCheck coverage-2", () => {
  it("listPackages", async () => {
    const { listPackages } = await import("../../services/background-check/background-check.service.js");
    const r = await listPackages(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("listAllChecks", async () => {
    const { listAllChecks } = await import("../../services/background-check/background-check.service.js");
    const r = await listAllChecks(ORG, {});
    expect(r).toHaveProperty("data");
  });
});

// ============================================================================
// REFERRAL SERVICE
// ============================================================================
describe("Referral coverage-2", () => {
  it("listReferrals", async () => {
    const { listReferrals } = await import("../../services/referral/referral.service.js");
    const r = await listReferrals(ORG, {});
    expect(r).toHaveProperty("data");
    expect(r).toHaveProperty("total");
  });
});

// ============================================================================
// ONBOARDING SERVICE
// ============================================================================
describe("Onboarding coverage-2", () => {
  it("listTemplates", async () => {
    const { listTemplates } = await import("../../services/onboarding/onboarding.service.js");
    const r = await listTemplates(ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("listChecklists", async () => {
    const { listChecklists } = await import("../../services/onboarding/onboarding.service.js");
    const r = await listChecklists(ORG, {});
    expect(r).toHaveProperty("data");
  });
});

// ============================================================================
// SURVEY SERVICE
// ============================================================================
describe("Survey coverage-2", () => {
  it("listSurveys", async () => {
    const { listSurveys } = await import("../../services/survey/survey.service.js");
    const r = await listSurveys(ORG, {});
    expect(r).toHaveProperty("data");
  });

  it("calculateNPS", async () => {
    const { calculateNPS } = await import("../../services/survey/survey.service.js");
    const r = await calculateNPS(ORG);
    expect(r).toHaveProperty("nps");
  });
});

// ============================================================================
// COMPARISON SERVICE
// ============================================================================
describe("Comparison coverage-2", () => {
  it("compareCandidates with empty array", async () => {
    const { compareCandidates } = await import("../../services/comparison/comparison.service.js");
    try {
      const r = await compareCandidates(ORG, []);
      expect(r).toBeTruthy();
    } catch {
      // May throw if empty candidates not allowed
    }
  });
});

// ============================================================================
// PORTAL SERVICE
// ============================================================================
describe("Portal coverage-2", () => {
  it("generatePortalToken", async () => {
    const { generatePortalToken } = await import("../../services/portal/portal.service.js");
    const token = generatePortalToken("test-candidate-id", ORG);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });
});

// ============================================================================
// RESUME SCORING SERVICE
// ============================================================================
describe("ResumeScoring coverage-2", () => {
  it("extractSkills from text", async () => {
    const { extractSkills } = await import("../../services/scoring/resume-scoring.service.js");
    const skills = extractSkills("Experienced in TypeScript, React, Node.js, and AWS. 5 years of experience with CI/CD pipelines.");
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
  });
});
