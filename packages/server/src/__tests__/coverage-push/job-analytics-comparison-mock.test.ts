import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters", () => {
  const m: any = {
    findOne: vi.fn(),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    raw: vi.fn().mockResolvedValue([[]]),
    updateMany: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return { getDB: () => m, __mockDB: m };
});

vi.mock("../../db/empcloud", () => ({
  findUserById: vi.fn(),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg", is_active: true }),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../config", () => ({
  config: {
    jwt: { secret: "test-secret", accessExpiry: "1h", refreshExpiry: "7d" },
    email: { host: "localhost", port: 587, user: "u", password: "p", from: "no-reply@t.com" },
    cors: { origin: "http://localhost:3000" },
    db: { host: "localhost", port: 3306, user: "u", password: "p", name: "test", poolMin: 2, poolMax: 10 },
    empcloudDb: { host: "localhost", port: 3306, user: "u", password: "p", name: "empcloud" },
    openai: { apiKey: "test-key", model: "gpt-4" },
  },
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
});

// ── Job Service ──────────────────────────────────────────────────────
import * as jobService from "../../services/job/job.service";

describe("Job Service", () => {
  const baseJob: any = {
    id: "j-1", organization_id: ORG, title: "Software Engineer",
    department: "Engineering", location: "Bengaluru", employment_type: "full_time",
    experience_min: 2, experience_max: 5, salary_min: 500000, salary_max: 1500000,
    description: "Build things", requirements: "JS, TS", status: "open",
    skills: JSON.stringify(["JavaScript", "TypeScript"]),
  };

  describe("createJob", () => {
    it("creates job posting", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]); // ensureUniqueSlug - no existing
      mockDB.create.mockResolvedValueOnce(baseJob);
      const result = await jobService.createJob(ORG, {
        title: "Software Engineer", department: "Engineering",
        description: "Build things",
      }, 1);
      expect(result.title).toBe("Software Engineer");
    });
  });

  describe("updateJob", () => {
    it("updates job", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.update.mockResolvedValueOnce({ ...baseJob, title: "Senior Engineer" });
      const result = await jobService.updateJob(ORG, "j-1", { title: "Senior Engineer" });
      expect(result.title).toBe("Senior Engineer");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(jobService.updateJob(ORG, "x", {})).rejects.toThrow();
    });
  });

  describe("getJob", () => {
    it("returns job with application count", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.count.mockResolvedValueOnce(10);
      const result = await jobService.getJob(ORG, "j-1");
      expect(result.application_count).toBe(10);
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(jobService.getJob(ORG, "x")).rejects.toThrow();
    });
  });

  describe("listJobs", () => {
    it("returns paginated jobs", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [baseJob], total: 1, page: 1, limit: 20, totalPages: 1,
      });
      mockDB.count.mockResolvedValueOnce(5); // application count
      const result = await jobService.listJobs(ORG, {});
      expect(result.data).toHaveLength(1);
    });

    it("applies status filter", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      await jobService.listJobs(ORG, { status: "closed" });
      expect(mockDB.findMany).toHaveBeenCalledWith("job_postings", expect.objectContaining({
        filters: expect.objectContaining({ status: "closed" }),
      }));
    });
  });

  describe("changeStatus", () => {
    it("changes job status to open", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseJob, status: "draft" });
      mockDB.update.mockResolvedValueOnce({ ...baseJob, status: "open" });
      const result = await jobService.changeStatus(ORG, "j-1", "open" as any);
      expect(result.status).toBe("open");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(jobService.changeStatus(ORG, "x", "open" as any)).rejects.toThrow();
    });

    it("changes to closed", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseJob, status: "open" });
      mockDB.update.mockResolvedValueOnce({ ...baseJob, status: "closed" });
      const result = await jobService.changeStatus(ORG, "j-1", "closed" as any);
      expect(result.status).toBe("closed");
    });
  });

  describe("getJobAnalytics", () => {
    it("returns job analytics", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.raw.mockResolvedValueOnce([[{ stage: "applied", count: 10 }]]);
      mockDB.raw.mockResolvedValueOnce([[{ source: "direct", count: 5 }]]);
      mockDB.count.mockResolvedValueOnce(3); // interviews
      mockDB.count.mockResolvedValueOnce(1); // offers
      const result = await jobService.getJobAnalytics(ORG, "j-1");
      expect(result).toBeDefined();
    });
  });

  describe("deleteJob", () => {
    it("deletes job with no applications", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.count.mockResolvedValueOnce(0);
      mockDB.delete.mockResolvedValueOnce(true);
      const result = await jobService.deleteJob(ORG, "j-1");
      expect(result).toBe(true);
    });

    it("throws when applications exist", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseJob);
      mockDB.count.mockResolvedValueOnce(5);
      await expect(jobService.deleteJob(ORG, "j-1")).rejects.toThrow();
    });
  });
});

// ── Analytics Service ─────────────────────────────────────────────────
import * as analyticsService from "../../services/analytics/analytics.service";

describe("Analytics Service", () => {
  describe("getDashboard", () => {
    it("returns dashboard overview stats", async () => {
      mockDB.count.mockResolvedValueOnce(5); // open jobs
      mockDB.count.mockResolvedValueOnce(50); // total candidates
      mockDB.count.mockResolvedValueOnce(30); // all applications
      mockDB.count.mockResolvedValueOnce(3); // rejected
      mockDB.count.mockResolvedValueOnce(2); // withdrawn
      mockDB.count.mockResolvedValueOnce(4); // hired
      const result = await analyticsService.getDashboard(ORG);
      expect(result.openJobs).toBe(5);
      expect(result.totalCandidates).toBe(50);
      expect(result.activeApplications).toBe(21);
    });
  });

  describe("getPipelineFunnel", () => {
    it("returns funnel data by stage", async () => {
      // getPipelineFunnel calls db.count for each stage
      for (let i = 0; i < 10; i++) {
        mockDB.count.mockResolvedValueOnce(10 - i);
      }
      const result = await analyticsService.getPipelineFunnel(ORG);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getTimeToHire", () => {
    it("returns time-to-hire metrics", async () => {
      mockDB.raw.mockResolvedValueOnce([[
        { avg_days: 15, min_days: 5, max_days: 30 },
      ]]);
      const result = await analyticsService.getTimeToHire(ORG);
      expect(result).toBeDefined();
    });

    it("handles no data", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]);
      const result = await analyticsService.getTimeToHire(ORG);
      expect(result).toBeDefined();
    });
  });

  describe("getSourceEffectiveness", () => {
    it("returns source breakdown", async () => {
      mockDB.raw.mockResolvedValueOnce([[
        { source: "direct", count: 10 },
        { source: "referral", count: 5 },
      ]]);
      const result = await analyticsService.getSourceEffectiveness(ORG);
      expect(result).toBeDefined();
    });
  });
});

// ── Comparison Service ───────────────────────────────────────────────
import * as comparisonService from "../../services/comparison/comparison.service";

describe("Comparison Service", () => {
  describe("compareCandidates", () => {
    it("compares multiple candidates for a job", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: JSON.stringify(["JS"]) }); // job
      // candidate 1
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", first_name: "A", last_name: "B", skills: JSON.stringify(["JS"]), experience_years: 3 });
      mockDB.findOne.mockResolvedValueOnce({ id: "s-1", overall_score: 80 }); // score
      mockDB.findMany.mockResolvedValueOnce({ data: [{ overall_score: 8 }], total: 1 }); // feedback
      // candidate 2
      mockDB.findOne.mockResolvedValueOnce({ id: "c-2", first_name: "C", last_name: "D", skills: JSON.stringify(["TS"]), experience_years: 5 });
      mockDB.findOne.mockResolvedValueOnce({ id: "s-2", overall_score: 70 }); // score
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 }); // feedback

      const result = await comparisonService.compareCandidates(ORG, "j-1", ["c-1", "c-2"]);
      expect(result).toBeDefined();
    });
  });
});

// ── Job Description Service ──────────────────────────────────────────
import * as jdService from "../../services/job-description/job-description.service";

describe("Job Description Service", () => {
  describe("generateJobDescription", () => {
    it("generates a job description using template", async () => {
      const result = await jdService.generateJobDescription({
        title: "Software Engineer",
        seniority: "mid",
        skills: ["JavaScript", "TypeScript", "React"],
        department: "Engineering",
        location: "Bengaluru",
        employment_type: "full_time",
      });
      expect(result).toBeDefined();
      expect(result.overview).toBeTruthy();
      expect(result.responsibilities.length).toBeGreaterThan(0);
      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.full_description).toBeTruthy();
    });

    it("generates for intern seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Intern",
        seniority: "intern",
        skills: ["Python"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for senior seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Senior Dev",
        seniority: "senior",
        skills: ["Go", "Kubernetes"],
        company_description: "A fintech startup",
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for lead seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Lead Engineer",
        seniority: "lead",
        skills: ["Architecture", "AWS"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for director seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Director of Engineering",
        seniority: "director",
        skills: ["Leadership"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for c_level seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "CTO",
        seniority: "c_level",
        skills: ["Strategy"],
        salary_range: "$200k-$400k",
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for junior seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "Junior Dev",
        seniority: "junior",
        skills: ["HTML", "CSS"],
      });
      expect(result.full_description).toBeTruthy();
    });

    it("generates for vp seniority", async () => {
      const result = await jdService.generateJobDescription({
        title: "VP Engineering",
        seniority: "vp",
        skills: ["Strategy", "Management"],
      });
      expect(result.full_description).toBeTruthy();
    });
  });
});
