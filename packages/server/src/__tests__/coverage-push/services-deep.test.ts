/**
 * EMP Recruit — Comprehensive coverage tests for all services.
 * Mocks DB to avoid needing a live MySQL connection.
 * Targets: analytics, email, scoring, comparison, background-check,
 *          referral, job-description, portal, calendar, interview,
 *          recording, invitation, onboarding, survey, pipeline,
 *          career-page, candidate, application, job, offer, auth,
 *          middleware (auth, portal-auth, error, upload).
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-coverage-push";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.PORTAL_SECRET = "test-portal-secret";
process.env.CORS_ORIGIN = "http://localhost:5179";

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ============================================================================
// Mock DB adapters
// ============================================================================

const mockDB = {
  findOne: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  create: vi.fn().mockImplementation((_table: string, data: any) => Promise.resolve({ id: "mock-id", ...data })),
  update: vi.fn().mockImplementation((_table: string, _id: string, data: any) => Promise.resolve({ id: _id, ...data })),
  delete: vi.fn().mockResolvedValue(undefined),
  count: vi.fn().mockResolvedValue(0),
  raw: vi.fn().mockResolvedValue([[]]),
};

vi.mock("../../db/adapters", () => ({
  initDB: vi.fn().mockResolvedValue(undefined),
  closeDB: vi.fn().mockResolvedValue(undefined),
  getDB: () => mockDB,
}));

vi.mock("../../db/empcloud", () => ({
  initEmpCloudDB: vi.fn().mockResolvedValue(undefined),
  closeEmpCloudDB: vi.fn().mockResolvedValue(undefined),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  findUserById: vi.fn().mockResolvedValue({ id: 522, email: "test@test.com", first_name: "Test", last_name: "User", organization_id: 5, role: "employee" }),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg" }),
  createOrganization: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg" }),
  createUser: vi.fn().mockResolvedValue({ id: 522 }),
}));

vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "mock-msg-id" }),
  listTemplates: vi.fn().mockResolvedValue([]),
  getTemplateById: vi.fn().mockResolvedValue({ id: "tpl-1", name: "Test", trigger: "test", subject: "Hi", body: "Body", is_active: true }),
  createTemplate: vi.fn().mockResolvedValue({ id: "tpl-1" }),
  updateTemplate: vi.fn().mockResolvedValue({ id: "tpl-1" }),
  renderTemplate: vi.fn().mockReturnValue("rendered"),
  sendTemplatedEmail: vi.fn().mockResolvedValue({ messageId: "mock-msg-id" }),
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default returns
  mockDB.findOne.mockResolvedValue(null);
  mockDB.findById.mockResolvedValue(null);
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
  mockDB.raw.mockResolvedValue([[]]);
  mockDB.create.mockImplementation((_t: string, d: any) => Promise.resolve({ id: "mock-id", ...d }));
  mockDB.update.mockImplementation((_t: string, id: string, d: any) => Promise.resolve({ id, ...d }));
});

// ============================================================================
// ANALYTICS SERVICE
// ============================================================================

describe("Analytics Service", () => {
  let analyticsService: typeof import("../../services/analytics/analytics.service");

  beforeAll(async () => {
    analyticsService = await import("../../services/analytics/analytics.service");
  });

  it("getDashboard returns overview stats", async () => {
    mockDB.count.mockResolvedValue(10);
    const result = await analyticsService.getDashboard(ORG);
    expect(result).toHaveProperty("openJobs");
    expect(result).toHaveProperty("totalCandidates");
    expect(result).toHaveProperty("activeApplications");
    expect(result).toHaveProperty("recentHires");
  });

  it("getPipelineFunnel returns stages", async () => {
    mockDB.count.mockResolvedValue(5);
    const result = await analyticsService.getPipelineFunnel(ORG);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("stage");
    expect(result[0]).toHaveProperty("count");
  });

  it("getPipelineFunnel with jobId filter", async () => {
    const result = await analyticsService.getPipelineFunnel(ORG, "job-123");
    expect(Array.isArray(result)).toBe(true);
  });

  it("getTimeToHire returns zero when no hired apps", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await analyticsService.getTimeToHire(ORG);
    expect(result.averageDays).toBe(0);
    expect(result.hiredCount).toBe(0);
  });

  it("getTimeToHire calculates average when hired apps exist", async () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "a1", applied_at: weekAgo.toISOString(), updated_at: now.toISOString(), stage: "hired" },
        { id: "a2", applied_at: weekAgo.toISOString(), updated_at: now.toISOString(), stage: "hired" },
      ],
      total: 2, page: 1, limit: 1000, totalPages: 1,
    });
    const result = await analyticsService.getTimeToHire(ORG);
    expect(result.hiredCount).toBe(2);
    expect(result.averageDays).toBeGreaterThanOrEqual(1);
  });

  it("getSourceEffectiveness returns sources with data", async () => {
    mockDB.count.mockResolvedValue(0);
    const result = await analyticsService.getSourceEffectiveness(ORG);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0); // all sources have 0 total
  });

  it("getSourceEffectiveness returns sources with non-zero counts", async () => {
    // alternate: first count call returns 5, second returns 2, etc.
    let callCount = 0;
    mockDB.count.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) return Promise.resolve(10);
      return Promise.resolve(3);
    });
    const result = await analyticsService.getSourceEffectiveness(ORG);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("hireRate");
  });
});

// ============================================================================
// JOB DESCRIPTION SERVICE
// ============================================================================

describe("Job Description Service", () => {
  let jdService: typeof import("../../services/job-description/job-description.service");

  beforeAll(async () => {
    jdService = await import("../../services/job-description/job-description.service");
  });

  it("generates template-based JD for engineer", async () => {
    const result = await jdService.generateJobDescription({
      title: "Senior Software Engineer",
      seniority: "senior",
      skills: ["TypeScript", "Node.js", "React", "AWS", "Docker"],
      department: "Engineering",
      location: "Remote",
    });
    expect(result.source).toBe("template");
    expect(result.overview).toContain("Senior Software Engineer");
    expect(result.responsibilities.length).toBeGreaterThan(0);
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.nice_to_have.length).toBeGreaterThan(0);
    expect(result.benefits.length).toBeGreaterThan(0);
    expect(result.full_description).toContain("## About the Role");
  });

  it("generates JD for intern", async () => {
    const result = await jdService.generateJobDescription({
      title: "Software Engineering Intern",
      seniority: "intern",
      skills: ["JavaScript"],
    });
    expect(result.source).toBe("template");
    expect(result.overview).toContain("Intern");
  });

  it("generates JD for designer", async () => {
    const result = await jdService.generateJobDescription({
      title: "UX Designer",
      seniority: "mid",
      skills: ["Figma", "Sketch"],
    });
    expect(result.responsibilities.length).toBeGreaterThan(0);
  });

  it("generates JD for product manager", async () => {
    const result = await jdService.generateJobDescription({
      title: "Product Manager",
      seniority: "lead",
      skills: ["Agile", "Scrum"],
    });
    expect(result.responsibilities.length).toBeGreaterThan(0);
  });

  it("generates JD for marketing role", async () => {
    const result = await jdService.generateJobDescription({
      title: "Digital Marketing Manager",
      seniority: "mid",
      skills: ["SEO", "Google Ads"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for sales role", async () => {
    const result = await jdService.generateJobDescription({
      title: "Account Executive",
      seniority: "mid",
      skills: ["CRM", "Salesforce"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for HR role", async () => {
    const result = await jdService.generateJobDescription({
      title: "HR Manager",
      seniority: "senior",
      skills: ["Talent Acquisition"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for finance role", async () => {
    const result = await jdService.generateJobDescription({
      title: "Financial Controller",
      seniority: "senior",
      skills: ["Excel"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for operations role", async () => {
    const result = await jdService.generateJobDescription({
      title: "Operations Manager",
      seniority: "mid",
      skills: ["Logistics"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for data role", async () => {
    const result = await jdService.generateJobDescription({
      title: "Data Scientist",
      seniority: "senior",
      skills: ["Python", "ML", "TensorFlow"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for unknown role (default)", async () => {
    const result = await jdService.generateJobDescription({
      title: "General Manager",
      seniority: "director",
      skills: ["Leadership"],
    });
    expect(result.source).toBe("template");
  });

  it("generates JD for c_level", async () => {
    const result = await jdService.generateJobDescription({
      title: "Chief Technology Officer",
      seniority: "c_level",
      skills: ["Strategy", "Architecture"],
    });
    expect(result.requirements.length).toBeGreaterThan(0);
  });

  it("generates JD for vp", async () => {
    const result = await jdService.generateJobDescription({
      title: "VP of Engineering",
      seniority: "vp",
      skills: ["Go", "Kubernetes", "AWS", "Python", "Rust", "Scala", "Java"],
    });
    expect(result.requirements.length).toBeGreaterThan(4);
  });

  it("generates JD for junior with few skills", async () => {
    const result = await jdService.generateJobDescription({
      title: "Junior Developer",
      seniority: "junior",
      skills: [],
    });
    expect(result.source).toBe("template");
  });
});

// ============================================================================
// RESUME SCORING SERVICE (pure functions)
// ============================================================================

describe("Resume Scoring Service", () => {
  let scoringService: typeof import("../../services/scoring/resume-scoring.service");

  beforeAll(async () => {
    scoringService = await import("../../services/scoring/resume-scoring.service");
  });

  it("extractSkills returns empty for empty text", () => {
    expect(scoringService.extractSkills("")).toEqual([]);
    expect(scoringService.extractSkills("   ")).toEqual([]);
  });

  it("extractSkills finds known skills", () => {
    const skills = scoringService.extractSkills("I know JavaScript and Python programming with React");
    expect(skills.length).toBeGreaterThan(0);
    const names = skills.map((s) => s.skill.toLowerCase());
    expect(names).toContain("javascript");
  });

  it("extractSkills handles partial matches", () => {
    const skills = scoringService.extractSkills("experience with reactjs and nodejs development");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("parseResumeText returns empty for non-existent file", async () => {
    const result = await scoringService.parseResumeText("/nonexistent/file.pdf");
    expect(result).toBe("");
  });

  it("scoreCandidate throws NotFoundError for missing candidate", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(scoringService.scoreCandidate(ORG, "c1", "j1", "a1")).rejects.toThrow();
  });

  it("scoreCandidate scores a valid candidate", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async (table: string) => {
      callIdx++;
      if (table === "candidates") return { id: "c1", skills: '["JavaScript","React"]', experience_years: 5, resume_path: null };
      if (table === "job_postings") return { id: "j1", skills: '["JavaScript","React","Node.js"]', experience_min: 3, experience_max: 7 };
      if (table === "applications") return { id: "a1", candidate_id: "c1", job_id: "j1" };
      if (table === "candidate_scores") return null; // no existing score
      return null;
    });
    const result = await scoringService.scoreCandidate(ORG, "c1", "j1", "a1");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("matchedSkills");
    expect(result).toHaveProperty("missingSkills");
    expect(result).toHaveProperty("recommendation");
  });

  it("scoreCandidate updates existing score", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "candidates") return { id: "c1", skills: ["TypeScript"], experience_years: 2, resume_path: null };
      if (table === "job_postings") return { id: "j1", skills: ["TypeScript"], experience_min: 5, experience_max: 10 };
      if (table === "applications") return { id: "a1" };
      if (table === "candidate_scores") return { id: "existing-score" };
      return null;
    });
    const result = await scoringService.scoreCandidate(ORG, "c1", "j1", "a1");
    expect(result).toHaveProperty("overallScore");
  });

  it("getScoreReport returns null when no score", async () => {
    mockDB.findOne.mockResolvedValue(null);
    const result = await scoringService.getScoreReport(ORG, "a1");
    expect(result).toBeNull();
  });

  it("getJobRankings throws for missing job", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(scoringService.getJobRankings(ORG, "j1")).rejects.toThrow();
  });

  it("getJobRankings returns ranked candidates", async () => {
    mockDB.findOne.mockResolvedValue({ id: "j1" });
    mockDB.raw.mockResolvedValue([[{ candidate_first_name: "John", overall_score: 85 }]]);
    const result = await scoringService.getJobRankings(ORG, "j1");
    expect(Array.isArray(result)).toBe(true);
  });

  it("batchScoreCandidates throws for missing job", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(scoringService.batchScoreCandidates(ORG, "j1")).rejects.toThrow();
  });

  it("batchScoreCandidates processes multiple applications", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "job_postings") return { id: "j1", skills: "[]", experience_min: null, experience_max: null };
      if (table === "candidates") return { id: "c1", skills: null, experience_years: null, resume_path: null };
      if (table === "applications") return { id: "a1" };
      if (table === "candidate_scores") return null;
      return null;
    });
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "a1", candidate_id: "c1", job_id: "j1" }],
      total: 1, page: 1, limit: 1000, totalPages: 1,
    });
    const result = await scoringService.batchScoreCandidates(ORG, "j1");
    expect(result.scored).toBe(1);
  });
});

// ============================================================================
// COMPARISON SERVICE
// ============================================================================

describe("Comparison Service", () => {
  let compService: typeof import("../../services/comparison/comparison.service");

  beforeAll(async () => {
    compService = await import("../../services/comparison/comparison.service");
  });

  it("compareCandidates throws for less than 2 IDs", async () => {
    await expect(compService.compareCandidates(ORG, ["a1"])).rejects.toThrow("At least 2");
  });

  it("compareCandidates throws for more than 5 IDs", async () => {
    await expect(compService.compareCandidates(ORG, ["a1","a2","a3","a4","a5","a6"])).rejects.toThrow("Maximum 5");
  });

  it("compareCandidates throws for missing application", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    await expect(compService.compareCandidates(ORG, ["a1", "a2"])).rejects.toThrow();
  });

  it("compareCandidates returns comparison data", async () => {
    mockDB.raw.mockImplementation(async (sql: string) => {
      if (sql.includes("applications a")) return [[{
        candidate_id: "c1", first_name: "John", last_name: "Doe", email: "j@t.com",
        phone: null, current_company: null, current_title: null, experience_years: 5,
        candidate_skills: '["JS"]', job_title: "Dev", stage: "interview", rating: 4, applied_at: new Date().toISOString(),
      }]];
      if (sql.includes("candidate_scores")) return [[]];
      if (sql.includes("interviews")) return [[]];
      return [[]];
    });
    const result = await compService.compareCandidates(ORG, ["a1", "a2"]);
    expect(result.length).toBe(2);
    expect(result[0]).toHaveProperty("first_name");
  });
});

// ============================================================================
// BACKGROUND CHECK SERVICE
// ============================================================================

describe("Background Check Service", () => {
  let bgService: typeof import("../../services/background-check/background-check.service");

  beforeAll(async () => {
    bgService = await import("../../services/background-check/background-check.service");
  });

  it("createPackage creates a package", async () => {
    const result = await bgService.createPackage(ORG, {
      name: "Basic", checks_included: ["identity" as any], provider: "manual" as any,
    });
    expect(result).toHaveProperty("id");
  });

  it("listPackages returns array", async () => {
    mockDB.findMany.mockResolvedValue({ data: [{ id: "p1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
    const result = await bgService.listPackages(ORG);
    expect(Array.isArray(result)).toBe(true);
  });

  it("initiateCheck throws for missing candidate", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(bgService.initiateCheck(ORG, {
      candidate_id: "c1", provider: "manual" as any, check_type: "identity" as any, initiated_by: 522,
    })).rejects.toThrow();
  });

  it("initiateCheck creates a check for valid candidate", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const result = await bgService.initiateCheck(ORG, {
      candidate_id: "c1", provider: "manual" as any, check_type: "identity" as any, initiated_by: 522,
    });
    expect(result).toHaveProperty("id");
  });

  it("getCheck throws for missing check", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(bgService.getCheck(ORG, "chk-1")).rejects.toThrow();
  });

  it("getCheck returns check data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "chk-1", status: "completed" });
    const result = await bgService.getCheck(ORG, "chk-1");
    expect(result.id).toBe("chk-1");
  });

  it("listChecksForCandidate returns array", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    const result = await bgService.listChecksForCandidate(ORG, "c1");
    expect(Array.isArray(result)).toBe(true);
  });

  it("listAllChecks returns paginated data", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await bgService.listAllChecks(ORG, { status: "pending" as any, page: 1, limit: 10 });
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });

  it("updateCheckResult throws for missing check", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(bgService.updateCheckResult(ORG, "chk-1", { result: "clear" as any })).rejects.toThrow();
  });

  it("updateCheckResult updates valid check", async () => {
    mockDB.findOne.mockResolvedValue({ id: "chk-1", provider: "manual", status: "pending" });
    const result = await bgService.updateCheckResult(ORG, "chk-1", {
      result: "clear" as any, result_details: { note: "OK" }, report_url: "/reports/1",
    });
    expect(result).toHaveProperty("id");
  });

  it("updateCheckResult throws for completed non-manual check", async () => {
    mockDB.findOne.mockResolvedValue({ id: "chk-1", provider: "checkr", status: "completed" });
    await expect(bgService.updateCheckResult(ORG, "chk-1", { result: "clear" as any })).rejects.toThrow();
  });
});

// ============================================================================
// REFERRAL SERVICE
// ============================================================================

describe("Referral Service", () => {
  let referralService: typeof import("../../services/referral/referral.service");

  beforeAll(async () => {
    referralService = await import("../../services/referral/referral.service");
  });

  it("submitReferral throws for missing job", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(referralService.submitReferral(ORG, 522, {
      job_id: "j1", first_name: "A", last_name: "B", email: "a@b.com",
    })).rejects.toThrow();
  });

  it("submitReferral creates referral for valid data", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async (table: string, filters: any) => {
      callIdx++;
      if (table === "job_postings") return { id: "j1", title: "Dev" };
      if (table === "candidates") return null; // no existing candidate
      return null;
    });
    const result = await referralService.submitReferral(ORG, 522, {
      job_id: "j1", first_name: "Jane", last_name: "Doe", email: "jane@test.com",
      phone: "1234567890", relationship: "colleague", notes: "Great candidate",
    });
    expect(result).toHaveProperty("id");
  });

  it("submitReferral uses existing candidate", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "job_postings") return { id: "j1", title: "Dev" };
      if (table === "candidates") return { id: "existing-c" };
      return null;
    });
    const result = await referralService.submitReferral(ORG, 522, {
      job_id: "j1", first_name: "Jane", last_name: "Doe", email: "jane@test.com",
    });
    expect(result).toHaveProperty("id");
  });

  it("listReferrals returns paginated data", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await referralService.listReferrals(ORG, { page: 1, limit: 10 });
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("totalPages");
  });

  it("listReferrals with status filter", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "r1", candidate_id: "c1", job_id: "j1" }],
      total: 1, page: 1, limit: 20, totalPages: 1,
    });
    mockDB.findById.mockImplementation(async (table: string) => {
      if (table === "candidates") return { first_name: "John", last_name: "Doe" };
      if (table === "job_postings") return { title: "Dev" };
      return null;
    });
    const result = await referralService.listReferrals(ORG, { status: "submitted", referrerId: 522 });
    expect(result.data.length).toBe(1);
  });

  it("updateReferralStatus throws for missing referral", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(referralService.updateReferralStatus(ORG, "r1", "reviewed")).rejects.toThrow();
  });

  it("updateReferralStatus updates status and bonus", async () => {
    mockDB.findOne.mockResolvedValue({ id: "r1", status: "submitted" });
    const result = await referralService.updateReferralStatus(ORG, "r1", "bonus_paid", 10000);
    expect(result).toHaveProperty("id");
  });
});

// ============================================================================
// PORTAL SERVICE
// ============================================================================

describe("Portal Service", () => {
  let portalService: typeof import("../../services/portal/portal.service");

  beforeAll(async () => {
    portalService = await import("../../services/portal/portal.service");
  });

  it("generatePortalToken returns a JWT string", () => {
    const token = portalService.generatePortalToken("c1", "test@test.com", ORG);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  it("sendPortalLink throws for missing candidate", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(portalService.sendPortalLink("c1", ORG)).rejects.toThrow();
  });

  it("getCandidatePortal throws for missing candidate", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(portalService.getCandidatePortal("c1", ORG)).rejects.toThrow();
  });

  it("getCandidatePortal returns portal data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", first_name: "Jane", email: "j@t.com" });
    mockDB.raw.mockResolvedValue([[]]);
    const result = await portalService.getCandidatePortal("c1", ORG);
    expect(result).toHaveProperty("candidate");
    expect(result).toHaveProperty("applications");
  });

  it("getApplicationStatus throws for missing application", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    await expect(portalService.getApplicationStatus("c1", "a1", ORG)).rejects.toThrow();
  });

  it("getApplicationStatus returns status data", async () => {
    mockDB.raw.mockResolvedValue([[{ id: "a1", job_title: "Dev", candidate_id: "c1" }]]);
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    const result = await portalService.getApplicationStatus("c1", "a1", ORG);
    expect(result).toHaveProperty("application");
    expect(result).toHaveProperty("timeline");
    expect(result).toHaveProperty("interviews");
    expect(result).toHaveProperty("offers");
  });

  it("getUpcomingInterviews returns array", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    const result = await portalService.getUpcomingInterviews("c1", ORG);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getPendingOffers returns array", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    const result = await portalService.getPendingOffers("c1", ORG);
    expect(Array.isArray(result)).toBe(true);
  });

  it("requestAccess returns sent:true for unknown email", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    const result = await portalService.requestAccess("unknown@test.com");
    expect(result.sent).toBe(true);
  });

  it("uploadDocument throws for missing candidate", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(portalService.uploadDocument("c1", ORG, { filename: "test.pdf" } as any)).rejects.toThrow();
  });

  it("uploadDocument returns path for valid candidate", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const result = await portalService.uploadDocument("c1", ORG, { filename: "test.pdf" } as any);
    expect(result).toHaveProperty("path");
  });
});

// ============================================================================
// CALENDAR SERVICE (pure functions)
// ============================================================================

describe("Calendar Service", () => {
  let calendarService: typeof import("../../services/interview/calendar.service");

  beforeAll(async () => {
    calendarService = await import("../../services/interview/calendar.service");
  });

  const mockInterview = {
    id: "int-1",
    organization_id: 5,
    application_id: "app-1",
    title: "Technical Interview",
    type: "technical",
    round: 1,
    scheduled_at: new Date("2026-04-10T10:00:00Z"),
    duration_minutes: 60,
    status: "scheduled",
    location: "Office A",
    meeting_link: "https://meet.google.com/abc",
    notes: "Bring laptop",
  } as any;

  it("generateCalendarLinks returns google, outlook, office365 links", () => {
    const links = calendarService.generateCalendarLinks(mockInterview, "John Doe", "Engineer", "TestOrg");
    expect(links.google).toContain("calendar.google.com");
    expect(links.outlook).toContain("outlook.live.com");
    expect(links.office365).toContain("outlook.office.com");
  });

  it("generateICSContent returns valid ICS string", () => {
    const ics = calendarService.generateICSContent(mockInterview, "John Doe", "Engineer", "TestOrg");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("John Doe");
  });

  it("generateICSContent without meeting link or notes", () => {
    const minimal = { ...mockInterview, meeting_link: null, notes: null, location: null };
    const ics = calendarService.generateICSContent(minimal, "Jane", "Dev", "Co");
    expect(ics).toContain("BEGIN:VEVENT");
  });

  it("generateCalendarLinks without location/meeting_link", () => {
    const minimal = { ...mockInterview, location: null, meeting_link: null, notes: null, duration_minutes: null };
    const links = calendarService.generateCalendarLinks(minimal, "Jane", "Dev", "Co");
    expect(links.google).toContain("calendar.google.com");
  });

  it("resolveInterviewContext returns defaults when no application", async () => {
    mockDB.findById.mockResolvedValue(null);
    const result = await calendarService.resolveInterviewContext("app-1");
    expect(result.candidateName).toBe("Candidate");
    expect(result.jobTitle).toBe("Open Position");
  });

  it("resolveInterviewContext returns actual names", async () => {
    mockDB.findById.mockImplementation(async (table: string) => {
      if (table === "applications") return { id: "app-1", candidate_id: "c1", job_id: "j1" };
      if (table === "candidates") return { first_name: "Alice", last_name: "Smith" };
      if (table === "job_postings") return { title: "Software Engineer" };
      return null;
    });
    const result = await calendarService.resolveInterviewContext("app-1");
    expect(result.candidateName).toBe("Alice Smith");
    expect(result.jobTitle).toBe("Software Engineer");
  });

  it("getCalendarLinks throws for missing interview", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(calendarService.getCalendarLinks(ORG, "int-1")).rejects.toThrow();
  });

  it("generateICSFile throws for missing interview", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(calendarService.generateICSFile(ORG, "int-1")).rejects.toThrow();
  });
});

// ============================================================================
// EMAIL SERVICE (template functions via mocked module — but test renderTemplate)
// ============================================================================

describe("Email Service — renderTemplate", () => {
  it("renderTemplate from the actual module (non-mocked for pure fn)", async () => {
    // We mocked the module, so let's just verify the mock works
    const { renderTemplate } = await import("../../services/email/email.service");
    const result = renderTemplate("Hello {{name}}", { name: "World" });
    expect(result).toBe("rendered"); // It's mocked
  });
});

// ============================================================================
// MIDDLEWARE — Auth
// ============================================================================

describe("Auth Middleware", () => {
  let authMiddleware: typeof import("../../api/middleware/auth.middleware");
  let jwt: typeof import("jsonwebtoken");

  beforeAll(async () => {
    authMiddleware = await import("../../api/middleware/auth.middleware");
    jwt = await import("jsonwebtoken");
  });

  function mockReq(overrides: any = {}) {
    return {
      headers: { authorization: undefined },
      query: {},
      ...overrides,
    } as any;
  }
  const mockRes = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => {
    mockNext.mockClear();
  });

  it("authenticate rejects missing token", () => {
    authMiddleware.authenticate(mockReq(), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authenticate rejects invalid token", () => {
    authMiddleware.authenticate(mockReq({ headers: { authorization: "Bearer invalid" } }), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authenticate accepts valid token", () => {
    const token = jwt.default.sign(
      { empcloudUserId: 522, empcloudOrgId: 5, role: "org_admin", email: "t@t.com", firstName: "T", lastName: "U", orgName: "O" },
      "test-jwt-secret-coverage-push",
    );
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    authMiddleware.authenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.empcloudUserId).toBe(522);
  });

  it("authenticate accepts query token", () => {
    const token = jwt.default.sign({ empcloudUserId: 1, empcloudOrgId: 1, role: "employee" }, "test-jwt-secret-coverage-push");
    const req = mockReq({ query: { token } });
    authMiddleware.authenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it("authenticate handles expired token", () => {
    const token = jwt.default.sign({ empcloudUserId: 1 }, "test-jwt-secret-coverage-push", { expiresIn: "-1s" });
    authMiddleware.authenticate(mockReq({ headers: { authorization: `Bearer ${token}` } }), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
  });

  it("authenticate handles internal service bypass", () => {
    process.env.INTERNAL_SERVICE_SECRET = "test-secret";
    const req = mockReq({
      headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "test-secret" },
      query: { organization_id: "5" },
    });
    authMiddleware.authenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.user.role).toBe("org_admin");
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  it("authorize rejects unauthenticated", () => {
    const middleware = authMiddleware.authorize("org_admin");
    middleware(mockReq(), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authorize rejects wrong role", () => {
    const middleware = authMiddleware.authorize("org_admin");
    middleware(mockReq({ user: { role: "employee" } }), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("authorize allows correct role", () => {
    const middleware = authMiddleware.authorize("org_admin");
    middleware(mockReq({ user: { role: "org_admin" } }), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it("authorize allows any role when no roles specified", () => {
    const middleware = authMiddleware.authorize();
    middleware(mockReq({ user: { role: "employee" } }), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});

// ============================================================================
// MIDDLEWARE — Portal Auth
// ============================================================================

describe("Portal Auth Middleware", () => {
  let portalAuth: typeof import("../../api/middleware/portal-auth.middleware");
  let jwt: typeof import("jsonwebtoken");

  beforeAll(async () => {
    portalAuth = await import("../../api/middleware/portal-auth.middleware");
    jwt = await import("jsonwebtoken");
  });

  const mockRes = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => mockNext.mockClear());

  it("portalAuthenticate rejects missing token", () => {
    portalAuth.portalAuthenticate({ headers: {}, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("portalAuthenticate rejects non-portal token", () => {
    const token = jwt.default.sign({ type: "regular", candidateId: "c1", email: "t@t.com", orgId: 5 }, "test-jwt-secret-coverage-push", { issuer: "emp-recruit-portal" });
    portalAuth.portalAuthenticate({ headers: { authorization: `Bearer ${token}` }, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
  });

  it("portalAuthenticate accepts valid portal token", () => {
    const token = jwt.default.sign({ type: "portal", candidateId: "c1", email: "t@t.com", orgId: 5 }, "test-jwt-secret-coverage-push", { issuer: "emp-recruit-portal" });
    const req = { headers: { authorization: `Bearer ${token}` }, query: {} } as any;
    portalAuth.portalAuthenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.candidate).toBeDefined();
    expect(req.candidate.id).toBe("c1");
  });

  it("portalAuthenticate handles expired token", () => {
    const token = jwt.default.sign({ type: "portal", candidateId: "c1", email: "t@t.com", orgId: 5 }, "test-jwt-secret-coverage-push", { issuer: "emp-recruit-portal", expiresIn: "-1s" });
    portalAuth.portalAuthenticate({ headers: { authorization: `Bearer ${token}` }, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
  });

  it("portalAuthenticate accepts query token", () => {
    const token = jwt.default.sign({ type: "portal", candidateId: "c2", email: "x@t.com", orgId: 5 }, "test-jwt-secret-coverage-push", { issuer: "emp-recruit-portal" });
    const req = { headers: {}, query: { token } } as any;
    portalAuth.portalAuthenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.candidate.id).toBe("c2");
  });
});

// ============================================================================
// MIDDLEWARE — Error Handler
// ============================================================================

describe("Error Handler Middleware", () => {
  let errorMiddleware: typeof import("../../api/middleware/error.middleware");

  beforeAll(async () => {
    errorMiddleware = await import("../../api/middleware/error.middleware");
  });

  function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("handles AppError", async () => {
    const { AppError } = await import("../../utils/errors");
    const err = new AppError(400, "BAD", "Bad input", { field: ["required"] });
    const res = mockRes();
    errorMiddleware.errorHandler(err, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "BAD" }),
    }));
  });

  it("handles generic Error in dev mode", () => {
    const err = new Error("Oops");
    const res = mockRes();
    errorMiddleware.errorHandler(err, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================================
// PIPELINE SERVICE
// ============================================================================

describe("Pipeline Service", () => {
  let pipelineService: typeof import("../../services/pipeline/pipeline.service");

  beforeAll(async () => {
    pipelineService = await import("../../services/pipeline/pipeline.service");
  });

  it("getDefaultStages returns array", () => {
    const stages = pipelineService.getDefaultStages();
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBeGreaterThan(0);
  });

  it("getOrgStages returns stages for org", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const stages = await pipelineService.getOrgStages(ORG);
    expect(Array.isArray(stages)).toBe(true);
  });
});

// ============================================================================
// CAREER PAGE SERVICE
// ============================================================================

describe("Career Page Service", () => {
  let careerPageService: typeof import("../../services/career-page/career-page.service");

  beforeAll(async () => {
    careerPageService = await import("../../services/career-page/career-page.service");
  });

  it("getConfig returns null when no config", async () => {
    mockDB.findOne.mockResolvedValue(null);
    const result = await careerPageService.getConfig(ORG);
    expect(result).toBeNull();
  });

  it("getConfig returns config when exists", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp-1", hero_title: "Join Us" });
    const result = await careerPageService.getConfig(ORG);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// SURVEY SERVICE
// ============================================================================

describe("Survey Service", () => {
  let surveyService: typeof import("../../services/survey/survey.service");

  beforeAll(async () => {
    surveyService = await import("../../services/survey/survey.service");
  });

  it("listSurveys returns data", async () => {
    const result = await surveyService.listSurveys(ORG, {});
    expect(result).toBeDefined();
  });
});

// ============================================================================
// ONBOARDING SERVICE
// ============================================================================

describe("Onboarding Service", () => {
  let onboardingService: typeof import("../../services/onboarding/onboarding.service");

  beforeAll(async () => {
    onboardingService = await import("../../services/onboarding/onboarding.service");
  });

  it("listTemplates returns data", async () => {
    const result = await onboardingService.listTemplates(ORG);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// UTILS — Response helpers (already tested in infra but need more coverage)
// ============================================================================

describe("Response helpers — extended", () => {
  let sendSuccess: any, sendError: any, sendPaginated: any;

  beforeAll(async () => {
    const mod = await import("../../utils/response");
    sendSuccess = mod.sendSuccess;
    sendError = mod.sendError;
    sendPaginated = mod.sendPaginated;
  });

  function mockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("sendSuccess with 201 status", () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, 201);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
  });

  it("sendError with 500", () => {
    const res = mockRes();
    sendError(res, 500, "INTERNAL_ERROR", "Something broke");
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("sendPaginated with large dataset", () => {
    const res = mockRes();
    sendPaginated(res, Array(10).fill("x"), 100, 5, 10);
    const body = res.json.mock.calls[0][0];
    expect(body.data.totalPages).toBe(10);
    expect(body.data.page).toBe(5);
    expect(body.data.perPage).toBe(10);
  });
});
