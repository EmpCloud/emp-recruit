import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters", () => {
  const m: any = {
    findOne: vi.fn(),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue(1),
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
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn().mockResolvedValue("resume text with JavaScript and React experience 5 years"),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
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

// ── Resume Scoring Service ───────────────────────────────────────────
import * as scoringService from "../../services/scoring/resume-scoring.service";

describe("Resume Scoring Service", () => {
  describe("extractSkills", () => {
    it("extracts skills from text", () => {
      const skills = scoringService.extractSkills("I know JavaScript, React, and Node.js");
      const names = skills.map(s => s.skill.toLowerCase());
      expect(names).toContain("javascript");
      expect(names).toContain("react");
    });

    it("returns empty for empty text", () => {
      expect(scoringService.extractSkills("")).toHaveLength(0);
      expect(scoringService.extractSkills("  ")).toHaveLength(0);
    });
  });

  describe("parseResumeText", () => {
    it("returns empty when file not found", async () => {
      const fs = await import("fs/promises");
      (fs.default.access as any).mockRejectedValueOnce(new Error("ENOENT"));
      const result = await scoringService.parseResumeText("/nonexistent.pdf");
      expect(result).toBe("");
    });

    it("reads txt files as UTF-8", async () => {
      const fs = await import("fs/promises");
      (fs.default.access as any).mockResolvedValueOnce(undefined);
      (fs.default.readFile as any).mockResolvedValueOnce("Hello world resume");
      const result = await scoringService.parseResumeText("/resume.txt");
      expect(result).toBe("Hello world resume");
    });
  });

  describe("scoreCandidate", () => {
    it("scores candidate against job", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", skills: JSON.stringify(["JavaScript", "React"]), experience_years: 5, resume_path: null }); // candidate
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: JSON.stringify(["JavaScript", "React", "TypeScript"]), experience_min: 3, experience_max: 7 }); // job
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" }); // application
      mockDB.findOne.mockResolvedValueOnce(null); // no existing score
      mockDB.create.mockResolvedValueOnce({});
      const result = await scoringService.scoreCandidate(ORG, "c-1", "j-1", "app-1");
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.matchedSkills.length).toBeGreaterThan(0);
    });

    it("handles candidate with no skills", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", skills: null, experience_years: null, resume_path: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: JSON.stringify(["Python"]), experience_min: 2, experience_max: 5 });
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findOne.mockResolvedValueOnce(null);
      mockDB.create.mockResolvedValueOnce({});
      const result = await scoringService.scoreCandidate(ORG, "c-1", "j-1", "app-1");
      expect(result.missingSkills).toContain("Python");
    });

    it("handles job with no required skills", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", skills: JSON.stringify(["JS"]), experience_years: 3, resume_path: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: null, experience_min: null, experience_max: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findOne.mockResolvedValueOnce(null);
      mockDB.create.mockResolvedValueOnce({});
      const result = await scoringService.scoreCandidate(ORG, "c-1", "j-1", "app-1");
      expect(result.overallScore).toBe(100);
    });

    it("updates existing score", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", skills: "[]", experience_years: 2, resume_path: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: "[]", experience_min: null, experience_max: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "score-1" }); // existing score
      mockDB.update.mockResolvedValueOnce({});
      const result = await scoringService.scoreCandidate(ORG, "c-1", "j-1", "app-1");
      expect(result.id).toBe("score-1");
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(scoringService.scoreCandidate(ORG, "x", "j-1", "app-1")).rejects.toThrow();
    });

    it("throws when job not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" });
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(scoringService.scoreCandidate(ORG, "c-1", "x", "app-1")).rejects.toThrow();
    });
  });

  describe("batchScoreCandidates", () => {
    it("scores all applicants for a job", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: "[]", experience_min: null, experience_max: null }); // job verify
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ id: "app-1", candidate_id: "c-1" }], total: 1,
      });
      // scoreCandidate calls
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", skills: "[]", experience_years: 3, resume_path: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1", skills: "[]", experience_min: null, experience_max: null });
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findOne.mockResolvedValueOnce(null);
      mockDB.create.mockResolvedValueOnce({});
      const result = await scoringService.batchScoreCandidates(ORG, "j-1");
      expect(result.scored).toBe(1);
    });

    it("throws when job not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(scoringService.batchScoreCandidates(ORG, "x")).rejects.toThrow();
    });
  });

  describe("getScoreReport", () => {
    it("returns score", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", overall_score: 85 });
      const result = await scoringService.getScoreReport(ORG, "app-1");
      expect(result?.overall_score).toBe(85);
    });

    it("returns null when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      const result = await scoringService.getScoreReport(ORG, "x");
      expect(result).toBeNull();
    });
  });

  describe("getJobRankings", () => {
    it("returns ranked candidates", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1" }); // job
      mockDB.raw.mockResolvedValueOnce([[{ candidate_first_name: "A", overall_score: 90 }]]);
      const result = await scoringService.getJobRankings(ORG, "j-1");
      expect(result).toHaveLength(1);
    });

    it("throws when job not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(scoringService.getJobRankings(ORG, "x")).rejects.toThrow();
    });
  });
});

// ── Pipeline Service ─────────────────────────────────────────────────
import * as pipelineService from "../../services/pipeline/pipeline.service";

describe("Pipeline Service", () => {
  describe("getDefaultStages", () => {
    it("returns default stages", () => {
      const stages = pipelineService.getDefaultStages();
      expect(stages.length).toBeGreaterThanOrEqual(7);
      expect(stages[0].name).toBe("Applied");
    });
  });

  describe("getOrgStages", () => {
    it("returns custom stages", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "s1", name: "Custom" }], total: 1 });
      const result = await pipelineService.getOrgStages(ORG);
      expect(result[0].name).toBe("Custom");
    });

    it("returns defaults when no custom stages", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 });
      const result = await pipelineService.getOrgStages(ORG);
      expect(result.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe("createStage", () => {
    it("creates custom stage", async () => {
      mockDB.findOne.mockResolvedValueOnce(null); // no dup slug
      mockDB.count.mockResolvedValueOnce(5); // not first stage
      mockDB.raw.mockResolvedValueOnce([[{ max_order: 6 }]]);
      mockDB.create.mockResolvedValueOnce({ id: "s1", name: "Review" });
      const result = await pipelineService.createStage(ORG, { name: "Review" });
      expect(result.name).toBe("Review");
    });

    it("seeds defaults when first custom stage", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      mockDB.count.mockResolvedValueOnce(0); // no existing stages
      mockDB.create.mockResolvedValue({}); // seed + actual
      mockDB.raw.mockResolvedValueOnce([[{ max_order: 6 }]]);
      await pipelineService.createStage(ORG, { name: "Custom" });
      // Should have been called for 7 defaults + 1 custom = 8 creates
      expect(mockDB.create).toHaveBeenCalledTimes(8);
    });

    it("throws when slug exists", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1" }); // dup slug
      await expect(pipelineService.createStage(ORG, { name: "Applied" })).rejects.toThrow(/already exists/i);
    });

    it("throws when name empty", async () => {
      await expect(pipelineService.createStage(ORG, { name: "" })).rejects.toThrow(/required/i);
    });
  });

  describe("updateStage", () => {
    it("updates stage", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1" });
      mockDB.update.mockResolvedValueOnce({ id: "s1", name: "Updated" });
      const result = await pipelineService.updateStage(ORG, "s1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(pipelineService.updateStage(ORG, "x", {})).rejects.toThrow();
    });
  });

  describe("deleteStage", () => {
    it("deletes non-default stage with no applications", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", is_default: false, slug: "custom" });
      mockDB.count.mockResolvedValueOnce(0);
      mockDB.delete.mockResolvedValueOnce(true);
      const result = await pipelineService.deleteStage(ORG, "s1");
      expect(result).toBe(true);
    });

    it("throws when deleting default stage", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", is_default: true });
      await expect(pipelineService.deleteStage(ORG, "s1")).rejects.toThrow(/default/i);
    });

    it("throws when applications are using the stage", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", is_default: false, slug: "custom", name: "Custom" });
      mockDB.count.mockResolvedValueOnce(3);
      await expect(pipelineService.deleteStage(ORG, "s1")).rejects.toThrow(/application/i);
    });
  });

  describe("reorderStages", () => {
    it("reorders stages", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1" }); // first
      mockDB.update.mockResolvedValueOnce({});
      mockDB.findOne.mockResolvedValueOnce({ id: "s2" }); // second
      mockDB.update.mockResolvedValueOnce({});
      // getOrgStages call
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "s1" }, { id: "s2" }], total: 2 });
      const result = await pipelineService.reorderStages(ORG, [
        { id: "s1", sort_order: 1 }, { id: "s2", sort_order: 0 },
      ]);
      expect(result).toHaveLength(2);
    });

    it("throws when empty items", async () => {
      await expect(pipelineService.reorderStages(ORG, [])).rejects.toThrow(/required/i);
    });
  });
});

// ── Survey Service ───────────────────────────────────────────────────
import * as surveyService from "../../services/survey/survey.service";

describe("Survey Service", () => {
  describe("sendSurvey", () => {
    it("creates and sends survey", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" }); // candidate
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" }); // application
      mockDB.findOne.mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValueOnce({ id: "s1", survey_type: "post_interview", status: "sent" });
      const result = await surveyService.sendSurvey(ORG, {
        candidate_id: "c-1", application_id: "app-1", survey_type: "post_interview" as any,
      });
      expect(result.questions).toBeDefined();
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it("throws when already sent", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "existing" }); // already sent
      await expect(surveyService.sendSurvey(ORG, {
        candidate_id: "c-1", application_id: "app-1", survey_type: "post_interview" as any,
      })).rejects.toThrow(/already/i);
    });
  });

  describe("submitResponse", () => {
    it("submits responses and marks complete", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", status: "sent", survey_type: "post_interview", organization_id: ORG });
      mockDB.create.mockResolvedValue({});
      mockDB.update.mockResolvedValueOnce({});
      const result = await surveyService.submitResponse("tok", [
        { question_key: "overall_experience", rating: 9 },
        { question_key: "feedback_text", text_response: "Great!" },
      ]);
      expect(result.success).toBe(true);
    });

    it("throws when already completed", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", status: "completed" });
      await expect(surveyService.submitResponse("tok", [])).rejects.toThrow(/already/i);
    });

    it("throws when expired", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", status: "expired" });
      await expect(surveyService.submitResponse("tok", [])).rejects.toThrow(/expired/i);
    });

    it("skips unknown question keys", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", status: "sent", survey_type: "post_interview", organization_id: ORG });
      mockDB.update.mockResolvedValueOnce({});
      await surveyService.submitResponse("tok", [
        { question_key: "unknown_key", rating: 5 },
      ]);
      // create should not be called for unknown keys
      expect(mockDB.create).not.toHaveBeenCalled();
    });
  });

  describe("getSurveyByToken", () => {
    it("returns survey with questions", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1", survey_type: "post_offer" });
      const result = await surveyService.getSurveyByToken("tok");
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(surveyService.getSurveyByToken("bad")).rejects.toThrow();
    });
  });

  describe("listSurveys", () => {
    it("returns paginated surveys", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "s1" }], total: 1, page: 1, limit: 20 });
      const result = await surveyService.listSurveys(ORG);
      expect(result.total).toBe(1);
    });
  });

  describe("getSurveyResults", () => {
    it("returns survey with responses", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "s1" });
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "r1", rating: 9 }], total: 1 });
      const result = await surveyService.getSurveyResults(ORG, "s1");
      expect(result.responses).toHaveLength(1);
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(surveyService.getSurveyResults(ORG, "x")).rejects.toThrow();
    });
  });

  describe("calculateNPS", () => {
    it("calculates NPS from ratings", async () => {
      mockDB.raw.mockResolvedValueOnce([[
        { rating: 10 }, { rating: 9 }, { rating: 8 }, { rating: 7 }, { rating: 3 },
      ]]);
      const result = await surveyService.calculateNPS(ORG);
      expect(result.promoters).toBe(2);
      expect(result.passives).toBe(2);
      expect(result.detractors).toBe(1);
      expect(result.total_responses).toBe(5);
    });

    it("returns zeros when no ratings", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]);
      const result = await surveyService.calculateNPS(ORG);
      expect(result.nps).toBe(0);
      expect(result.total_responses).toBe(0);
    });

    it("applies filters", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]);
      await surveyService.calculateNPS(ORG, { survey_type: "post_interview" as any, from_date: "2026-01-01", to_date: "2026-12-31" });
      const query = mockDB.raw.mock.calls[0][0];
      expect(query).toContain("survey_type");
      expect(query).toContain("completed_at >=");
      expect(query).toContain("completed_at <=");
    });
  });
});
