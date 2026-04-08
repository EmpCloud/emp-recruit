// ============================================================================
// EMP RECRUIT — Service Coverage Final Tests
// Targets: pipeline defaultStages, errors, survey, onboarding templates
// ============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "";
process.env.DB_NAME = "emp_recruit";
process.env.DB_PROVIDER = "mysql";
process.env.EMPCLOUD_DB_HOST = "localhost";
process.env.EMPCLOUD_DB_PORT = "3306";
process.env.EMPCLOUD_DB_USER = "empcloud";
process.env.EMPCLOUD_DB_PASSWORD = process.env.EMPCLOUD_DB_PASSWORD || "";
process.env.EMPCLOUD_DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-cov-final";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.PORTAL_SECRET = "test-portal-secret-cov-final";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { initDB, closeDB, getDB } from "../../db/adapters";
import { initEmpCloudDB, closeEmpCloudDB } from "../../db/empcloud";

vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

let db: ReturnType<typeof getDB>;
const ORG = 5;

beforeAll(async () => {
  await initDB();
  await initEmpCloudDB();
  db = getDB();
}, 30000);

afterAll(async () => {
  await closeEmpCloudDB();
  await closeDB();
}, 15000);

// ── ERROR CLASSES ────────────────────────────────────────────────────────────

describe("Recruit error classes", () => {
  let errors: any;

  beforeAll(async () => {
    errors = await import("../../utils/errors");
  });

  it("NotFoundError with resource and id", () => {
    const err = new errors.NotFoundError("Job", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("abc-123");
  });

  it("ValidationError with details", () => {
    const err = new errors.ValidationError("Invalid", { title: ["required"] });
    expect(err.statusCode).toBe(400);
  });

  it("ForbiddenError", () => {
    const err = new errors.ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("ConflictError", () => {
    const err = new errors.ConflictError("Dup");
    expect(err.statusCode).toBe(409);
  });
});

// ── PIPELINE SERVICE — default stages ────────────────────────────────────────

describe("Pipeline service — default stages", () => {
  let pipelineService: any;

  beforeAll(async () => {
    pipelineService = await import("../../services/pipeline/pipeline.service");
  });

  it("getDefaultStages returns array", () => {
    const stages = pipelineService.getDefaultStages();
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages[0]).toHaveProperty("name");
  });

  it("getOrgStages returns stages for org", async () => {
    const stages = await pipelineService.getOrgStages(ORG);
    expect(Array.isArray(stages)).toBe(true);
  });
});

// ── CAREER PAGE SERVICE — getConfig ──────────────────────────────────────────

describe("Career page service", () => {
  let careerPageService: any;

  beforeAll(async () => {
    careerPageService = await import("../../services/career-page/career-page.service");
  });

  it("getConfig returns config or null", async () => {
    const result = await careerPageService.getConfig(ORG);
    expect(result === null || typeof result === "object").toBe(true);
  });
});

// ── SURVEY SERVICE — listSurveys ─────────────────────────────────────────────

describe("Survey service", () => {
  let surveyService: any;

  beforeAll(async () => {
    surveyService = await import("../../services/survey/survey.service");
  });

  it("listSurveys returns data", async () => {
    const result = await surveyService.listSurveys(ORG, {});
    expect(result).toBeDefined();
  });

  it("getSurveyByToken rejects invalid token", async () => {
    await expect(surveyService.getSurveyByToken("invalid-token-xyz"))
      .rejects.toThrow();
  });
});

// ── ONBOARDING SERVICE — listTemplates ───────────────────────────────────────

describe("Onboarding service", () => {
  let onboardingService: any;

  beforeAll(async () => {
    onboardingService = await import("../../services/onboarding/onboarding.service");
  });

  it("listTemplates returns data", async () => {
    const result = await onboardingService.listTemplates(ORG);
    expect(result).toBeDefined();
  });
});
