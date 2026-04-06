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
  findUserById: vi.fn().mockResolvedValue({ id: 1, email: "u@t.com", first_name: "U", last_name: "T" }),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg", is_active: true }),
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "m1" }),
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

import * as interviewService from "../../services/interview/interview.service";

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
});

describe("Interview Service", () => {
  const baseInterview: any = {
    id: "int-1", organization_id: ORG, application_id: "app-1",
    type: "video", round: 1, title: "Technical Interview",
    scheduled_at: "2026-06-01T10:00:00Z", duration_minutes: 60,
    location: null, meeting_link: null, status: "scheduled",
    notes: null, created_by: 1,
  };

  describe("scheduleInterview", () => {
    it("creates interview with panelists", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" }); // application
      mockDB.create.mockResolvedValueOnce(baseInterview); // interview
      mockDB.create.mockResolvedValueOnce({ id: "p1", interview_id: "int-1", user_id: 10, role: "lead" }); // panelist
      const result = await interviewService.scheduleInterview(ORG, {
        application_id: "app-1", type: "video" as any, round: 1, title: "Tech", scheduled_at: "2026-06-01T10:00:00Z", duration_minutes: 60, created_by: 1,
        panelists: [{ user_id: 10, role: "lead" }],
      });
      expect(result.panelists).toHaveLength(1);
    });

    it("creates interview without panelists", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.create.mockResolvedValueOnce(baseInterview);
      const result = await interviewService.scheduleInterview(ORG, {
        application_id: "app-1", type: "in_person" as any, round: 1, title: "Tech", scheduled_at: "2026-06-01T10:00:00Z", duration_minutes: 60, created_by: 1,
      });
      expect(result.panelists).toHaveLength(0);
    });

    it("throws when application not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(interviewService.scheduleInterview(ORG, {
        application_id: "x", type: "video" as any, round: 1, title: "T", scheduled_at: "2026-06-01T10:00:00Z", duration_minutes: 60, created_by: 1,
      })).rejects.toThrow();
    });
  });

  describe("updateInterview", () => {
    it("updates interview fields", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.update.mockResolvedValueOnce({ ...baseInterview, title: "Updated" });
      const result = await interviewService.updateInterview(ORG, "int-1", { title: "Updated" });
      expect(result.title).toBe("Updated");
    });

    it("converts scheduled_at to Date", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.update.mockResolvedValueOnce({ ...baseInterview });
      await interviewService.updateInterview(ORG, "int-1", { scheduled_at: "2026-07-01T10:00:00Z" });
      expect(mockDB.update).toHaveBeenCalledWith("interviews", "int-1", expect.objectContaining({
        scheduled_at: expect.any(Date),
      }));
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(interviewService.updateInterview(ORG, "x", {})).rejects.toThrow();
    });
  });

  describe("listInterviews", () => {
    it("returns enriched interview list", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [baseInterview], total: 1, page: 1, limit: 20, totalPages: 1,
      });
      mockDB.findById.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1", job_id: "j-1" });
      mockDB.findById.mockResolvedValueOnce({ first_name: "Jane", last_name: "Doe" });
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" });
      mockDB.count.mockResolvedValueOnce(2);
      const result = await interviewService.listInterviews(ORG, {});
      expect(result.data[0].candidate_name).toBe("Jane Doe");
      expect(result.data[0].panelist_count).toBe(2);
    });

    it("handles missing application", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [baseInterview], total: 1, page: 1, limit: 20, totalPages: 1,
      });
      mockDB.findById.mockResolvedValueOnce(null);
      mockDB.count.mockResolvedValueOnce(0);
      const result = await interviewService.listInterviews(ORG, {});
      expect(result.data[0].candidate_name).toBe("Unknown");
    });
  });

  describe("getInterview", () => {
    it("returns interview detail with panelists and feedback", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "p1" }], total: 1 }); // panelists
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 }); // feedback
      mockDB.findById.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1", job_id: "j-1" });
      mockDB.findById.mockResolvedValueOnce({ first_name: "J", last_name: "D" });
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" });
      const result = await interviewService.getInterview(ORG, "int-1");
      expect(result.panelists).toHaveLength(1);
      expect(result.candidate_name).toBe("J D");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(interviewService.getInterview(ORG, "x")).rejects.toThrow();
    });
  });

  describe("changeStatus", () => {
    it("changes interview status", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.update.mockResolvedValueOnce({ ...baseInterview, status: "completed" });
      const result = await interviewService.changeStatus(ORG, "int-1", "completed" as any);
      expect(result.status).toBe("completed");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(interviewService.changeStatus(ORG, "x", "completed" as any)).rejects.toThrow();
    });
  });

  describe("addPanelist", () => {
    it("adds panelist to interview", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.findOne.mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValueOnce({ id: "p1", user_id: 10, role: "lead" });
      const result = await interviewService.addPanelist(ORG, "int-1", 10, "lead");
      expect(result.user_id).toBe(10);
    });

    it("throws when already a panelist", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.findOne.mockResolvedValueOnce({ id: "p1" });
      await expect(interviewService.addPanelist(ORG, "int-1", 10, "lead")).rejects.toThrow(/already/i);
    });
  });

  describe("removePanelist", () => {
    it("removes panelist", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.deleteMany.mockResolvedValueOnce(1);
      await interviewService.removePanelist(ORG, "int-1", 10);
      expect(mockDB.deleteMany).toHaveBeenCalled();
    });

    it("throws when panelist not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.deleteMany.mockResolvedValueOnce(0);
      await expect(interviewService.removePanelist(ORG, "int-1", 99)).rejects.toThrow();
    });
  });

  describe("submitFeedback", () => {
    it("submits feedback as panelist", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview); // interview
      mockDB.findOne.mockResolvedValueOnce({ id: "p1", user_id: 1 }); // panelist
      mockDB.findOne.mockResolvedValueOnce(null); // no existing feedback
      mockDB.create.mockResolvedValueOnce({ id: "fb1", recommendation: "hire" });
      const result = await interviewService.submitFeedback(ORG, "int-1", 1, { recommendation: "hire" as any });
      expect(result.recommendation).toBe("hire");
    });

    it("throws when not panelist", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.findOne.mockResolvedValueOnce(null); // not a panelist
      await expect(interviewService.submitFeedback(ORG, "int-1", 99, { recommendation: "hire" as any })).rejects.toThrow();
    });

    it("throws when feedback already submitted", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.findOne.mockResolvedValueOnce({ id: "p1" }); // panelist
      mockDB.findOne.mockResolvedValueOnce({ id: "fb1" }); // existing feedback
      await expect(interviewService.submitFeedback(ORG, "int-1", 1, { recommendation: "hire" as any })).rejects.toThrow(/already/i);
    });
  });

  describe("getFeedback", () => {
    it("returns feedback list", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "fb1" }], total: 1 });
      const result = await interviewService.getFeedback(ORG, "int-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getAggregatedFeedback", () => {
    it("aggregates scores across interviews", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ ...baseInterview, id: "int-1", title: "Round 1", round: 1 }], total: 1,
      });
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ id: "fb1", overall_score: 8, technical_score: 9, communication_score: 7, cultural_fit_score: 8, recommendation: "hire" }], total: 1,
      });
      const result = await interviewService.getAggregatedFeedback(ORG, "app-1");
      expect(result.total_interviews).toBe(1);
      expect(result.total_feedback).toBe(1);
      expect(result.average_overall_score).toBe(8);
    });

    it("returns zeros when no interviews", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 });
      const result = await interviewService.getAggregatedFeedback(ORG, "app-1");
      expect(result.total_interviews).toBe(0);
      expect(result.average_overall_score).toBeNull();
    });
  });

  describe("generateMeetingLink", () => {
    it("generates Jitsi link and updates interview", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.update.mockResolvedValueOnce({});
      const link = await interviewService.generateMeetingLink(ORG, "int-1");
      expect(link).toContain("meet.jit.si");
    });

    it("generates link with google provider (falls back to jitsi)", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseInterview);
      mockDB.update.mockResolvedValueOnce({});
      const link = await interviewService.generateMeetingLink(ORG, "int-1", "google");
      expect(link).toContain("meet.jit.si");
    });

    it("throws when interview not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(interviewService.generateMeetingLink(ORG, "x")).rejects.toThrow();
    });
  });
});
