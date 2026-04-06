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

import * as appService from "../../services/application/application.service";

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
});

describe("Application Service", () => {
  describe("createApplication", () => {
    it("creates application when job and candidate exist", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1" }); // job
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", resume_path: "/r.pdf" }); // candidate
      mockDB.findOne.mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValueOnce({ id: "app-1", stage: "applied" }); // application
      mockDB.create.mockResolvedValueOnce({}); // stage history
      const result = await appService.createApplication(ORG, { job_id: "j-1", candidate_id: "c-1" });
      expect(result.stage).toBe("applied");
    });

    it("throws when job not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(appService.createApplication(ORG, { job_id: "x", candidate_id: "c-1" })).rejects.toThrow();
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1" }); // job exists
      mockDB.findOne.mockResolvedValueOnce(null); // candidate missing
      await expect(appService.createApplication(ORG, { job_id: "j-1", candidate_id: "x" })).rejects.toThrow();
    });

    it("throws on duplicate application", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "j-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "existing-app" }); // duplicate
      await expect(appService.createApplication(ORG, { job_id: "j-1", candidate_id: "c-1" })).rejects.toThrow(/already/i);
    });
  });

  describe("moveStage", () => {
    it("moves application to new stage", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", stage: "applied" });
      mockDB.update.mockResolvedValueOnce({ id: "app-1", stage: "screened" });
      mockDB.create.mockResolvedValueOnce({}); // history
      const result = await appService.moveStage(ORG, "app-1", "screened", 1);
      expect(result.stage).toBe("screened");
    });

    it("includes rejection reason", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", stage: "interview" });
      mockDB.update.mockResolvedValueOnce({ id: "app-1", stage: "rejected" });
      mockDB.create.mockResolvedValueOnce({});
      await appService.moveStage(ORG, "app-1", "rejected", 1, "note", "Not qualified");
      expect(mockDB.update).toHaveBeenCalledWith("applications", "app-1", expect.objectContaining({ rejection_reason: "Not qualified" }));
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(appService.moveStage(ORG, "x", "screened", 1)).rejects.toThrow();
    });
  });

  describe("listApplications", () => {
    it("returns paginated applications with default params", async () => {
      mockDB.raw.mockResolvedValueOnce([[{ total: 1 }]]); // count
      mockDB.raw.mockResolvedValueOnce([[{ id: "app-1", candidate_first_name: "A", candidate_last_name: "B" }]]); // data
      const result = await appService.listApplications(ORG, {});
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it("applies filters", async () => {
      mockDB.raw.mockResolvedValueOnce([[{ total: 0 }]]);
      mockDB.raw.mockResolvedValueOnce([[]]);
      await appService.listApplications(ORG, { job_id: "j-1", stage: "applied", candidate_id: "c-1" });
      const countQuery = mockDB.raw.mock.calls[0][0];
      expect(countQuery).toContain("a.job_id = ?");
      expect(countQuery).toContain("a.stage = ?");
    });
  });

  describe("getApplication", () => {
    it("returns detailed application", async () => {
      mockDB.raw.mockResolvedValueOnce([[{ id: "app-1", job_title: "Dev" }]]);
      const result = await appService.getApplication(ORG, "app-1");
      expect(result.job_title).toBe("Dev");
    });

    it("throws when not found", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]); // empty result
      await expect(appService.getApplication(ORG, "x")).rejects.toThrow();
    });
  });

  describe("getTimeline", () => {
    it("returns stage history", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "h1", from_stage: null, to_stage: "applied" }], total: 1 });
      const result = await appService.getTimeline(ORG, "app-1");
      expect(result).toHaveLength(1);
    });

    it("throws when application not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(appService.getTimeline(ORG, "x")).rejects.toThrow();
    });
  });

  describe("addNote", () => {
    it("appends note to existing notes", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", notes: "Old note" });
      mockDB.update.mockResolvedValueOnce({ id: "app-1", notes: "Old note\n\n[ts] (User 1): New" });
      const result = await appService.addNote(ORG, "app-1", 1, "New");
      expect(mockDB.update).toHaveBeenCalled();
    });

    it("creates note when no existing notes", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", notes: null });
      mockDB.update.mockResolvedValueOnce({ id: "app-1" });
      await appService.addNote(ORG, "app-1", 1, "First note");
      expect(mockDB.update).toHaveBeenCalled();
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(appService.addNote(ORG, "x", 1, "note")).rejects.toThrow();
    });
  });
});
