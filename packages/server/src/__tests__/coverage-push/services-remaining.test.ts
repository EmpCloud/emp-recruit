/**
 * EMP Recruit — Coverage push for remaining 0% services.
 * Application, Assessment, Auth, Candidate, Email templates,
 * Interview, Job, Offer, Offer-letter, Onboarding, Pipeline, Survey, Career-page.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-coverage-push";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.PORTAL_SECRET = "test-portal-secret";
process.env.CORS_ORIGIN = "http://localhost:5179";

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockDB = {
  findOne: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  create: vi.fn().mockImplementation((_t: string, d: any) => Promise.resolve({ id: "mock-id", ...d })),
  update: vi.fn().mockImplementation((_t: string, id: string, d: any) => Promise.resolve({ id, ...d })),
  delete: vi.fn().mockResolvedValue(undefined),
  count: vi.fn().mockResolvedValue(0),
  raw: vi.fn().mockResolvedValue([[]]),
};

vi.mock("../../db/adapters", () => ({
  initDB: vi.fn(), closeDB: vi.fn(), getDB: () => mockDB,
}));
vi.mock("../../db/empcloud", () => ({
  initEmpCloudDB: vi.fn(), closeEmpCloudDB: vi.fn(),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  findUserById: vi.fn().mockResolvedValue({ id: 522, email: "t@t.com", first_name: "Test", last_name: "User", organization_id: 5, role: "employee" }),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg" }),
  createOrganization: vi.fn().mockResolvedValue({ id: 6 }),
  createUser: vi.fn().mockResolvedValue({ id: 600 }),
}));
vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "m1" }),
  renderTemplate: vi.fn().mockReturnValue("rendered"),
  sendTemplatedEmail: vi.fn().mockResolvedValue(null),
  listTemplates: vi.fn().mockResolvedValue([]),
  getTemplateById: vi.fn().mockResolvedValue(null),
  createTemplate: vi.fn().mockResolvedValue({ id: "t1" }),
  updateTemplate: vi.fn().mockResolvedValue({ id: "t1" }),
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORG = 5;
beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findOne.mockResolvedValue(null);
  mockDB.findById.mockResolvedValue(null);
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
  mockDB.raw.mockResolvedValue([[]]);
  mockDB.create.mockImplementation((_t: string, d: any) => Promise.resolve({ id: "mock-id", ...d }));
  mockDB.update.mockImplementation((_t: string, id: string, d: any) => Promise.resolve({ id, ...d }));
});

// ── APPLICATION SERVICE ─────────────────────────────────────────────────────
describe("Application Service", () => {
  let svc: typeof import("../../services/application/application.service");
  beforeAll(async () => { svc = await import("../../services/application/application.service"); });

  it("createApplication throws for missing job", async () => {
    await expect(svc.createApplication(ORG, { job_id: "j1", candidate_id: "c1" })).rejects.toThrow();
  });
  it("createApplication throws for missing candidate", async () => {
    let c = 0;
    mockDB.findOne.mockImplementation(async () => { c++; if (c === 1) return { id: "j1" }; return null; });
    await expect(svc.createApplication(ORG, { job_id: "j1", candidate_id: "c1" })).rejects.toThrow();
  });
  it("createApplication throws for duplicate", async () => {
    let c = 0;
    mockDB.findOne.mockImplementation(async () => { c++; return { id: c === 1 ? "j1" : c === 2 ? "c1" : "existing" }; });
    await expect(svc.createApplication(ORG, { job_id: "j1", candidate_id: "c1" })).rejects.toThrow("already applied");
  });
  it("createApplication succeeds", async () => {
    let c = 0;
    mockDB.findOne.mockImplementation(async () => { c++; if (c <= 2) return { id: "x", resume_path: null }; return null; });
    const r = await svc.createApplication(ORG, { job_id: "j1", candidate_id: "c1", source: "linkedin", cover_letter: "hi" });
    expect(r).toHaveProperty("id");
  });
  it("moveStage throws for missing app", async () => {
    await expect(svc.moveStage(ORG, "a1", "interview", 522)).rejects.toThrow();
  });
  it("moveStage succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "a1", stage: "applied" });
    const r = await svc.moveStage(ORG, "a1", "interview", 522, "Notes");
    expect(r).toHaveProperty("id");
  });
  it("listApplications returns data", async () => {
    const r = await svc.listApplications(ORG, {});
    expect(r).toBeDefined();
  });
  it("getApplication throws for missing", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    await expect(svc.getApplication(ORG, "a1")).rejects.toThrow();
  });
  it("getTimeline returns history", async () => {
    mockDB.findOne.mockResolvedValue({ id: "a1" });
    const r = await svc.getTimeline(ORG, "a1");
    expect(Array.isArray(r) || r !== undefined).toBe(true);
  });
  it("addNote creates a note", async () => {
    mockDB.findOne.mockResolvedValue({ id: "a1" });
    const r = await svc.addNote(ORG, "a1", 522, "Test note");
    expect(r).toHaveProperty("id");
  });
});

// ── CANDIDATE SERVICE ───────────────────────────────────────────────────────
describe("Candidate Service", () => {
  let svc: typeof import("../../services/candidate/candidate.service");
  beforeAll(async () => { svc = await import("../../services/candidate/candidate.service"); });

  it("createCandidate throws for duplicate email", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    await expect(svc.createCandidate(ORG, { first_name: "A", last_name: "B", email: "a@b.com" })).rejects.toThrow("already exists");
  });
  it("createCandidate succeeds", async () => {
    const r = await svc.createCandidate(ORG, {
      first_name: "Alice", last_name: "Smith", email: "alice@test.com",
      phone: "123", source: "referral", skills: ["JS"], experience_years: 5,
    });
    expect(r).toHaveProperty("id");
  });
  it("updateCandidate throws for missing", async () => {
    await expect(svc.updateCandidate(ORG, "c1", { first_name: "X" })).rejects.toThrow();
  });
  it("updateCandidate succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const r = await svc.updateCandidate(ORG, "c1", { first_name: "Updated" });
    expect(r).toHaveProperty("id");
  });
  it("listCandidates returns data", async () => {
    const r = await svc.listCandidates(ORG, {});
    expect(r).toBeDefined();
  });
  it("getCandidate throws for missing", async () => {
    await expect(svc.getCandidate(ORG, "c1")).rejects.toThrow();
  });
  it("getCandidateApplications returns data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const r = await svc.getCandidateApplications(ORG, "c1");
    expect(r).toBeDefined();
  });
  it("updateResumePath throws for missing", async () => {
    await expect(svc.updateResumePath(ORG, "c1", "/path")).rejects.toThrow();
  });
  it("updateResumePath succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const r = await svc.updateResumePath(ORG, "c1", "/new/path");
    expect(r).toHaveProperty("id");
  });
});

// ── JOB SERVICE ─────────────────────────────────────────────────────────────
describe("Job Service", () => {
  let svc: typeof import("../../services/job/job.service");
  beforeAll(async () => { svc = await import("../../services/job/job.service"); });

  it("generateSlug converts title", () => {
    expect(svc.generateSlug("Senior Software Engineer")).toBe("senior-software-engineer");
  });
  it("createJob succeeds", async () => {
    mockDB.raw.mockResolvedValue([[]]); // no slug conflict
    const r = await svc.createJob(ORG, { title: "Dev", skills: ["JS"] });
    expect(r).toHaveProperty("id");
  });
  it("updateJob throws for missing", async () => {
    await expect(svc.updateJob(ORG, "j1", { title: "Updated" })).rejects.toThrow();
  });
  it("updateJob succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "j1" });
    mockDB.raw.mockResolvedValue([[]]);
    const r = await svc.updateJob(ORG, "j1", { title: "Updated" });
    expect(r).toHaveProperty("id");
  });
  it("listJobs returns data", async () => {
    const r = await svc.listJobs(ORG, {});
    expect(r).toBeDefined();
  });
  it("getJob throws for missing", async () => {
    await expect(svc.getJob(ORG, "j1")).rejects.toThrow();
  });
  it("changeStatus throws for missing", async () => {
    await expect(svc.changeStatus(ORG, "j1", "closed" as any)).rejects.toThrow();
  });
  it("changeStatus succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "j1" });
    const r = await svc.changeStatus(ORG, "j1", "closed" as any);
    expect(r).toHaveProperty("id");
  });
  it("deleteJob throws for missing", async () => {
    await expect(svc.deleteJob(ORG, "j1")).rejects.toThrow();
  });
  it("deleteJob succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "j1" });
    mockDB.delete.mockResolvedValue(true);
    const r = await svc.deleteJob(ORG, "j1");
    expect(r !== undefined).toBe(true);
  });
  it("getJobAnalytics throws for missing", async () => {
    await expect(svc.getJobAnalytics(ORG, "j1")).rejects.toThrow();
  });
});

// ── OFFER SERVICE ───────────────────────────────────────────────────────────
describe("Offer Service", () => {
  let svc: typeof import("../../services/offer/offer.service");
  beforeAll(async () => { svc = await import("../../services/offer/offer.service"); });

  it("createOffer throws for missing application", async () => {
    await expect(svc.createOffer(ORG, {
      application_id: "a1", salary_amount: 100000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-15", job_title: "Dev", created_by: 522,
    })).rejects.toThrow();
  });
  it("createOffer succeeds", async () => {
    let c = 0;
    mockDB.findOne.mockImplementation(async () => { c++; if (c === 1) return { id: "a1", candidate_id: "c1", job_id: "j1" }; return null; });
    const r = await svc.createOffer(ORG, {
      application_id: "a1", salary_amount: 100000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-15", job_title: "Dev", created_by: 522,
      department: "Eng", benefits: "Health", notes: "Good",
    });
    expect(r).toHaveProperty("id");
  });
  it("updateOffer throws for missing", async () => {
    await expect(svc.updateOffer(ORG, "o1", { salary_amount: 120000 })).rejects.toThrow();
  });
  it("getOffer throws for missing", async () => {
    await expect(svc.getOffer(ORG, "o1")).rejects.toThrow();
  });
  it("getOffer succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "o1" });
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const r = await svc.getOffer(ORG, "o1");
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("approvers");
  });
  it("listOffers returns paginated data", async () => {
    const r = await svc.listOffers(ORG, { status: "draft" as any, page: 1, limit: 10 });
    expect(r).toBeDefined();
  });
  it("sendOffer throws for missing", async () => {
    await expect(svc.sendOffer(ORG, "o1")).rejects.toThrow();
  });
  it("revokeOffer throws for missing", async () => {
    await expect(svc.revokeOffer(ORG, "o1")).rejects.toThrow();
  });
  it("acceptOffer throws for missing", async () => {
    await expect(svc.acceptOffer(ORG, "o1")).rejects.toThrow();
  });
  it("declineOffer throws for missing", async () => {
    await expect(svc.declineOffer(ORG, "o1")).rejects.toThrow();
  });
});

// ── ASSESSMENT SERVICE ──────────────────────────────────────────────────────
describe("Assessment Service", () => {
  let svc: typeof import("../../services/assessment/assessment.service");
  beforeAll(async () => { svc = await import("../../services/assessment/assessment.service"); });

  it("createTemplate creates template", async () => {
    const r = await svc.createTemplate(ORG, {
      title: "Tech Assessment", description: "For devs", time_limit_minutes: 60,
      passing_score: 70, questions: [{ question: "What is JS?", type: "text" }],
    } as any);
    expect(r).toHaveProperty("id");
  });
  it("listTemplates returns data", async () => {
    const r = await svc.listTemplates(ORG);
    expect(r).toBeDefined();
  });
  it("getTemplate throws for missing", async () => {
    await expect(svc.getTemplate(ORG, "t1")).rejects.toThrow();
  });
  it("getAssessmentByToken throws for invalid token", async () => {
    await expect(svc.getAssessmentByToken("bad-token")).rejects.toThrow();
  });
  it("getAssessmentResults throws for missing", async () => {
    await expect(svc.getAssessmentResults(ORG, "a1")).rejects.toThrow();
  });
  it("listCandidateAssessments returns data", async () => {
    const r = await svc.listCandidateAssessments(ORG, "c1");
    expect(r).toBeDefined();
  });
});

// ── INTERVIEW SERVICE ───────────────────────────────────────────────────────
describe("Interview Service", () => {
  let svc: typeof import("../../services/interview/interview.service");
  beforeAll(async () => { svc = await import("../../services/interview/interview.service"); });

  it("scheduleInterview throws for missing app", async () => {
    await expect(svc.scheduleInterview(ORG, {
      application_id: "a1", title: "Tech", type: "technical" as any, round: 1,
      scheduled_at: new Date().toISOString(), duration_minutes: 60, created_by: 522,
    })).rejects.toThrow();
  });
  it("scheduleInterview succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "a1" });
    const r = await svc.scheduleInterview(ORG, {
      application_id: "a1", title: "Tech Interview", type: "technical" as any,
      round: 1, scheduled_at: new Date().toISOString(), duration_minutes: 60,
      created_by: 522, location: "Room A", meeting_link: "https://meet.google.com/abc",
    });
    expect(r).toHaveProperty("id");
  });
  it("updateInterview throws for missing", async () => {
    await expect(svc.updateInterview(ORG, "i1", { title: "Updated" })).rejects.toThrow();
  });
  it("listInterviews returns data", async () => {
    const r = await svc.listInterviews(ORG, {});
    expect(r).toBeDefined();
  });
  it("getInterview throws for missing", async () => {
    await expect(svc.getInterview(ORG, "i1")).rejects.toThrow();
  });
  it("changeStatus throws for missing", async () => {
    await expect(svc.changeStatus(ORG, "i1", "completed" as any, 522)).rejects.toThrow();
  });
});

// ── RECORDING SERVICE ───────────────────────────────────────────────────────
describe("Recording Service", () => {
  let svc: typeof import("../../services/interview/recording.service");
  beforeAll(async () => { svc = await import("../../services/interview/recording.service"); });

  it("getRecording throws for missing", async () => {
    await expect(svc.getRecording(ORG, "r1")).rejects.toThrow();
  });
  it("getRecordings returns data", async () => {
    const r = await svc.getRecordings(ORG, "i1");
    expect(r).toBeDefined();
  });
  it("deleteRecording throws for missing", async () => {
    await expect(svc.deleteRecording(ORG, "r1")).rejects.toThrow();
  });
  it("getTranscript returns null for missing", async () => {
    const r = await svc.getTranscript(ORG, "r1");
    expect(r === null || r === undefined).toBe(true);
  });
});

// ── OFFER LETTER SERVICE ────────────────────────────────────────────────────
describe("Offer Letter Service", () => {
  let svc: typeof import("../../services/offer/offer-letter.service");
  beforeAll(async () => { svc = await import("../../services/offer/offer-letter.service"); });

  it("createLetterTemplate creates template", async () => {
    const r = await svc.createLetterTemplate(ORG, {
      name: "Standard Offer", content_template: "Dear {{candidate_name}},",
    } as any);
    expect(r).toHaveProperty("id");
  });
  it("listLetterTemplates returns data", async () => {
    const r = await svc.listLetterTemplates(ORG);
    expect(Array.isArray(r)).toBe(true);
  });
  it("getOfferLetter throws for missing", async () => {
    await expect(svc.getOfferLetter(ORG, "ol1")).rejects.toThrow();
  });
});

// ── PIPELINE SERVICE (remaining) ────────────────────────────────────────────
describe("Pipeline Service — remaining", () => {
  let svc: typeof import("../../services/pipeline/pipeline.service");
  beforeAll(async () => { svc = await import("../../services/pipeline/pipeline.service"); });

  it("createStage creates a stage", async () => {
    const r = await svc.createStage(ORG, { name: "New Stage", order: 5 } as any);
    expect(r).toHaveProperty("id");
  });
  it("updateStage throws for missing", async () => {
    await expect(svc.updateStage(ORG, "s1", { name: "Updated" } as any)).rejects.toThrow();
  });
  it("deleteStage throws for missing", async () => {
    await expect(svc.deleteStage(ORG, "s1")).rejects.toThrow();
  });
});

// ── SURVEY SERVICE (remaining) ──────────────────────────────────────────────
describe("Survey Service — remaining", () => {
  let svc: typeof import("../../services/survey/survey.service");
  beforeAll(async () => { svc = await import("../../services/survey/survey.service"); });

  it("getSurveyByToken throws for invalid", async () => {
    await expect(svc.getSurveyByToken("bad")).rejects.toThrow();
  });
  it("listSurveys returns data", async () => {
    const r = await svc.listSurveys(ORG, {});
    expect(r).toBeDefined();
  });
});

// ── CAREER PAGE SERVICE (remaining) ─────────────────────────────────────────
describe("Career Page Service — remaining", () => {
  let svc: typeof import("../../services/career-page/career-page.service");
  beforeAll(async () => { svc = await import("../../services/career-page/career-page.service"); });

  it("updateConfig creates when none exists", async () => {
    const r = await svc.updateConfig(ORG, { hero_title: "Join Us" } as any);
    expect(r).toBeDefined();
  });
  it("updateConfig updates existing", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp1" });
    const r = await svc.updateConfig(ORG, { hero_title: "Updated" } as any);
    expect(r).toBeDefined();
  });
  it("publishCareerPage throws when no config", async () => {
    await expect(svc.publishCareerPage(ORG)).rejects.toThrow();
  });
  it("getPublicCareerPage throws for missing", async () => {
    await expect(svc.getPublicCareerPage("nonexistent")).rejects.toThrow();
  });
  it("getPublicJobs returns jobs", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp1", slug: "test" });
    const r = await svc.getPublicJobs("test");
    expect(Array.isArray(r)).toBe(true);
  });
});

// ── ONBOARDING SERVICE (remaining) ──────────────────────────────────────────
describe("Onboarding Service — remaining", () => {
  let svc: typeof import("../../services/onboarding/onboarding.service");
  beforeAll(async () => { svc = await import("../../services/onboarding/onboarding.service"); });

  it("createTemplate creates", async () => {
    const r = await svc.createTemplate(ORG, { name: "Standard", description: "Default onboarding" } as any, 522);
    expect(r).toBeDefined();
  });
  it("listTemplates returns data", async () => {
    const r = await svc.listTemplates(ORG);
    expect(r).toBeDefined();
  });
  it("listTemplateTasks returns data (with template)", async () => {
    mockDB.findOne.mockResolvedValue({ id: "t1", name: "Standard" });
    const r = await svc.listTemplateTasks(ORG, "t1");
    expect(r).toBeDefined();
  });
});
