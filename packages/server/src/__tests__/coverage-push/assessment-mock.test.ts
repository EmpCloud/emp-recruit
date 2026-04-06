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
vi.mock("../../db/empcloud", () => ({ findUserById: vi.fn(), findOrgById: vi.fn() }));
vi.mock("../../utils/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

import * as assessmentService from "../../services/assessment/assessment.service";

const ORG = 5;
const questions = [
  { question: "What is 2+2?", options: ["3", "4", "5"], type: "mcq", correct_answer: "4" },
  { question: "Explain OOP", options: [], type: "text" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
});

describe("Assessment Service", () => {
  describe("createTemplate", () => {
    it("creates template with questions", async () => {
      mockDB.create.mockResolvedValueOnce({ id: "tpl-1", name: "Tech Quiz", questions: JSON.stringify(questions) });
      const result = await assessmentService.createTemplate(ORG, {
        name: "Tech Quiz", assessment_type: "technical" as any, questions: questions as any,
      });
      expect(result.name).toBe("Tech Quiz");
    });

    it("throws when no questions", async () => {
      await expect(assessmentService.createTemplate(ORG, {
        name: "Empty", assessment_type: "technical" as any, questions: [],
      })).rejects.toThrow(/question/i);
    });
  });

  describe("listTemplates", () => {
    it("returns templates for org", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "t1" }], total: 1 });
      const result = await assessmentService.listTemplates(ORG);
      expect(result).toHaveLength(1);
    });

    it("filters by assessment_type", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 });
      await assessmentService.listTemplates(ORG, { assessment_type: "aptitude" as any });
      expect(mockDB.findMany).toHaveBeenCalledWith("assessment_templates", expect.objectContaining({
        filters: expect.objectContaining({ assessment_type: "aptitude" }),
      }));
    });
  });

  describe("getTemplate", () => {
    it("returns template", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "tpl-1", name: "Quiz" });
      const result = await assessmentService.getTemplate(ORG, "tpl-1");
      expect(result.name).toBe("Quiz");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(assessmentService.getTemplate(ORG, "x")).rejects.toThrow();
    });
  });

  describe("inviteCandidate", () => {
    it("invites candidate for assessment", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" }); // candidate
      mockDB.findOne.mockResolvedValueOnce({ id: "tpl-1", questions: JSON.stringify(questions) }); // template
      mockDB.findOne.mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValueOnce({ id: "ca-1", status: "invited" });
      const result = await assessmentService.inviteCandidate(ORG, { candidate_id: "c-1", template_id: "tpl-1" });
      expect(result.status).toBe("invited");
    });

    it("throws when candidate already has active assessment", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "tpl-1", questions: JSON.stringify(questions) });
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-existing", status: "invited" });
      await expect(assessmentService.inviteCandidate(ORG, { candidate_id: "c-1", template_id: "tpl-1" })).rejects.toThrow(/active/i);
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(assessmentService.inviteCandidate(ORG, { candidate_id: "x", template_id: "t1" })).rejects.toThrow();
    });
  });

  describe("getAssessmentByToken", () => {
    it("starts assessment on first access", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "invited", template_id: "tpl-1" });
      mockDB.update.mockResolvedValueOnce({});
      mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", name: "Quiz", description: null, assessment_type: "technical", time_limit_minutes: 30, questions: JSON.stringify(questions) });
      const result = await assessmentService.getAssessmentByToken("tok-123");
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0]).not.toHaveProperty("correct_answer");
    });

    it("throws when assessment completed", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "completed" });
      await expect(assessmentService.getAssessmentByToken("tok")).rejects.toThrow(/completed/i);
    });

    it("throws when assessment expired", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "expired" });
      await expect(assessmentService.getAssessmentByToken("tok")).rejects.toThrow(/expired/i);
    });

    it("throws when token not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(assessmentService.getAssessmentByToken("bad")).rejects.toThrow();
    });
  });

  describe("submitAssessment", () => {
    it("scores and completes assessment", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "started", template_id: "tpl-1", organization_id: ORG });
      mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", questions: JSON.stringify(questions) });
      mockDB.create.mockResolvedValue({});
      mockDB.raw.mockResolvedValueOnce([[{ score: 1 }]]);
      mockDB.update.mockResolvedValueOnce({});
      const result = await assessmentService.submitAssessment("tok", [
        { question_index: 0, answer: "4" },
        { question_index: 1, answer: "Classes and objects" },
      ]);
      expect(result.score).toBe(1);
      expect(result.max_score).toBe(1);
    });

    it("throws when already completed", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "completed" });
      await expect(assessmentService.submitAssessment("tok", [])).rejects.toThrow(/submitted/i);
    });

    it("throws when expired", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "expired" });
      await expect(assessmentService.submitAssessment("tok", [])).rejects.toThrow(/expired/i);
    });

    it("throws when still invited (not started)", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "invited" });
      await expect(assessmentService.submitAssessment("tok", [])).rejects.toThrow(/started/i);
    });

    it("handles out-of-range question index", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", status: "started", template_id: "tpl-1", organization_id: ORG });
      mockDB.findById.mockResolvedValueOnce({ id: "tpl-1", questions: JSON.stringify(questions) });
      mockDB.raw.mockResolvedValueOnce([[]]);
      mockDB.update.mockResolvedValueOnce({});
      const result = await assessmentService.submitAssessment("tok", [
        { question_index: 99, answer: "x" },
      ]);
      expect(result.score).toBe(0);
    });
  });

  describe("getAssessmentResults", () => {
    it("returns assessment with responses and template", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ca-1", template_id: "tpl-1" });
      mockDB.findById.mockResolvedValueOnce({ id: "tpl-1" });
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "r1" }], total: 1 });
      const result = await assessmentService.getAssessmentResults(ORG, "ca-1");
      expect(result.responses).toHaveLength(1);
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(assessmentService.getAssessmentResults(ORG, "x")).rejects.toThrow();
    });
  });

  describe("listCandidateAssessments", () => {
    it("returns assessments for candidate", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "ca-1" }], total: 1 });
      const result = await assessmentService.listCandidateAssessments(ORG, "c-1");
      expect(result).toHaveLength(1);
    });
  });
});
