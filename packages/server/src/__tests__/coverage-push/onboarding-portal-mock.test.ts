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
vi.mock("../../config", () => ({
  config: {
    jwt: { secret: "test-secret-key-1234567890", accessExpiry: "1h", refreshExpiry: "7d" },
    email: { host: "localhost", port: 587, user: "u", password: "p", from: "no-reply@test.com" },
    cors: { origin: "http://localhost:3000" },
    db: { host: "localhost", port: 3306, user: "u", password: "p", name: "test", poolMin: 2, poolMax: 10 },
    empcloudDb: { host: "localhost", port: 3306, user: "u", password: "p", name: "empcloud" },
  },
}));
vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "m1" }),
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
});

// ── Onboarding Service ───────────────────────────────────────────────
import * as onboardingService from "../../services/onboarding/onboarding.service";

describe("Onboarding Service", () => {
  describe("createTemplate", () => {
    it("creates onboarding template", async () => {
      mockDB.create.mockResolvedValueOnce({ id: "ot-1", name: "Standard" });
      const result = await onboardingService.createTemplate(ORG, { name: "Standard" });
      expect(result.name).toBe("Standard");
    });

    it("unsets existing defaults when is_default", async () => {
      mockDB.updateMany.mockResolvedValueOnce(1);
      mockDB.create.mockResolvedValueOnce({ id: "ot-1", is_default: true });
      await onboardingService.createTemplate(ORG, { name: "Default", is_default: true, department: "Engineering" });
      expect(mockDB.updateMany).toHaveBeenCalled();
    });
  });

  describe("updateTemplate", () => {
    it("updates template", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1", department: null });
      mockDB.update.mockResolvedValueOnce({ id: "ot-1", name: "Updated" });
      const result = await onboardingService.updateTemplate(ORG, "ot-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(onboardingService.updateTemplate(ORG, "x", {})).rejects.toThrow();
    });

    it("unsets defaults on is_default change", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1", department: "Eng" });
      mockDB.updateMany.mockResolvedValueOnce(1);
      mockDB.update.mockResolvedValueOnce({ id: "ot-1", is_default: true });
      await onboardingService.updateTemplate(ORG, "ot-1", { is_default: true });
      expect(mockDB.updateMany).toHaveBeenCalled();
    });
  });

  describe("listTemplates", () => {
    it("returns templates with task count", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "ot-1" }], total: 1 });
      mockDB.count.mockResolvedValueOnce(3);
      const result = await onboardingService.listTemplates(ORG);
      expect(result[0].task_count).toBe(3);
    });
  });

  describe("listTemplateTasks", () => {
    it("returns tasks", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" });
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "tt-1" }], total: 1 });
      const result = await onboardingService.listTemplateTasks(ORG, "ot-1");
      expect(result).toHaveLength(1);
    });

    it("throws when template not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(onboardingService.listTemplateTasks(ORG, "x")).rejects.toThrow();
    });
  });

  describe("addTemplateTask", () => {
    it("adds task to template", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" });
      mockDB.create.mockResolvedValueOnce({ id: "tt-1", title: "Task 1" });
      const result = await onboardingService.addTemplateTask(ORG, "ot-1", {
        title: "Task 1", category: "documents", due_days: 5, order: 1,
      });
      expect(result.title).toBe("Task 1");
    });
  });

  describe("updateTemplateTask", () => {
    it("updates task", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" }); // template
      mockDB.findOne.mockResolvedValueOnce({ id: "tt-1" }); // task
      mockDB.update.mockResolvedValueOnce({ id: "tt-1", title: "Updated" });
      const result = await onboardingService.updateTemplateTask(ORG, "ot-1", "tt-1", { title: "Updated" });
      expect(result.title).toBe("Updated");
    });
  });

  describe("removeTemplateTask", () => {
    it("removes task", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" });
      mockDB.delete.mockResolvedValueOnce(true);
      await onboardingService.removeTemplateTask(ORG, "ot-1", "tt-1");
      expect(mockDB.delete).toHaveBeenCalled();
    });

    it("throws when task delete returns false", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" });
      mockDB.delete.mockResolvedValueOnce(false);
      await expect(onboardingService.removeTemplateTask(ORG, "ot-1", "tt-1")).rejects.toThrow();
    });
  });

  describe("generateChecklist", () => {
    it("generates checklist from template", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1" }); // application
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" }); // template
      mockDB.findOne.mockResolvedValueOnce(null); // no existing checklist
      mockDB.findMany.mockResolvedValueOnce({ data: [
        { id: "tt-1", title: "T1", description: null, category: "docs", due_days: 5, order: 1 },
      ], total: 1 });
      mockDB.create.mockResolvedValueOnce({ id: "cl-1", status: "not_started" }); // checklist
      mockDB.create.mockResolvedValueOnce({ id: "task-1", title: "T1" }); // task
      const result = await onboardingService.generateChecklist(ORG, "app-1", "ot-1", "2026-06-01");
      expect(result.tasks).toHaveLength(1);
    });

    it("throws when active checklist exists", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "ot-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "cl-1", status: "in_progress" }); // active
      await expect(onboardingService.generateChecklist(ORG, "app-1", "ot-1", "2026-06-01")).rejects.toThrow(/active/i);
    });
  });

  describe("getChecklist", () => {
    it("returns checklist with tasks and progress", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "cl-1", candidate_id: "c-1", application_id: "app-1" });
      mockDB.findMany.mockResolvedValueOnce({ data: [
        { id: "t1", status: "completed" }, { id: "t2", status: "not_started" },
      ], total: 2 });
      mockDB.findById.mockResolvedValueOnce({ first_name: "A", last_name: "B" }); // candidate
      mockDB.findById.mockResolvedValueOnce({ job_id: "j-1" }); // application
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" }); // job
      const result = await onboardingService.getChecklist(ORG, "cl-1");
      expect(result.progress.percentage).toBe(50);
    });
  });

  describe("listChecklists", () => {
    it("returns enriched checklists", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ id: "cl-1", candidate_id: "c-1", application_id: "app-1" }],
        total: 1, page: 1, limit: 20, totalPages: 1,
      });
      mockDB.findById.mockResolvedValueOnce({ first_name: "A", last_name: "B" }); // candidate
      mockDB.findById.mockResolvedValueOnce({ job_id: "j-1" }); // application
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" }); // job
      mockDB.count.mockResolvedValueOnce(5); // total tasks
      mockDB.count.mockResolvedValueOnce(3); // completed tasks
      mockDB.findOne.mockResolvedValueOnce({ joining_date: "2026-06-01" }); // offer
      const result = await onboardingService.listChecklists(ORG, {});
      expect(result.data[0].progress.percentage).toBe(60);
    });
  });

  describe("updateTaskStatus", () => {
    it("completes a task and updates checklist to in_progress", async () => {
      mockDB.findById.mockResolvedValueOnce({ id: "task-1", checklist_id: "cl-1" }); // task
      mockDB.findOne.mockResolvedValueOnce({ id: "cl-1", started_at: null }); // checklist
      mockDB.update.mockResolvedValueOnce({ id: "task-1", status: "completed" }); // update task
      mockDB.count.mockResolvedValueOnce(3); // total
      mockDB.count.mockResolvedValueOnce(1); // completed
      mockDB.update.mockResolvedValueOnce({}); // update checklist
      const result = await onboardingService.updateTaskStatus(ORG, "task-1", "completed", 1);
      expect(result.status).toBe("completed");
    });

    it("marks checklist as completed when all tasks done", async () => {
      mockDB.findById.mockResolvedValueOnce({ id: "task-1", checklist_id: "cl-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "cl-1", started_at: new Date() });
      mockDB.update.mockResolvedValueOnce({ id: "task-1", status: "completed" });
      mockDB.count.mockResolvedValueOnce(2);
      mockDB.count.mockResolvedValueOnce(2); // all completed
      mockDB.update.mockResolvedValueOnce({});
      await onboardingService.updateTaskStatus(ORG, "task-1", "completed", 1);
      expect(mockDB.update).toHaveBeenLastCalledWith("onboarding_checklists", "cl-1", expect.objectContaining({
        status: "completed",
      }));
    });

    it("sets not_started when no tasks completed", async () => {
      mockDB.findById.mockResolvedValueOnce({ id: "task-1", checklist_id: "cl-1" });
      mockDB.findOne.mockResolvedValueOnce({ id: "cl-1" });
      mockDB.update.mockResolvedValueOnce({ id: "task-1", status: "not_started" });
      mockDB.count.mockResolvedValueOnce(3);
      mockDB.count.mockResolvedValueOnce(0);
      mockDB.update.mockResolvedValueOnce({});
      await onboardingService.updateTaskStatus(ORG, "task-1", "not_started" as any, 1);
    });

    it("throws when task not found", async () => {
      mockDB.findById.mockResolvedValueOnce(null);
      await expect(onboardingService.updateTaskStatus(ORG, "x", "completed", 1)).rejects.toThrow();
    });
  });
});

// ── Portal Service ───────────────────────────────────────────────────
import * as portalService from "../../services/portal/portal.service";

describe("Portal Service", () => {
  describe("generatePortalToken", () => {
    it("generates a JWT token", () => {
      const token = portalService.generatePortalToken("c-1", "c@t.com", ORG);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
    });
  });

  describe("sendPortalLink", () => {
    it("sends portal link email", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", email: "c@t.com", first_name: "A" });
      await portalService.sendPortalLink("c-1", ORG);
      const { sendEmail } = await import("../email/email.service");
      expect(sendEmail).toHaveBeenCalled();
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(portalService.sendPortalLink("x", ORG)).rejects.toThrow();
    });
  });

  describe("requestAccess", () => {
    it("returns success even when no candidates found", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]); // no candidates
      const result = await portalService.requestAccess("nobody@t.com");
      expect(result.sent).toBe(true);
    });

    it("sends links when candidates exist", async () => {
      mockDB.raw.mockResolvedValueOnce([[
        { id: "c-1", organization_id: 5, first_name: "A", email: "a@t.com" },
      ]]);
      const result = await portalService.requestAccess("a@t.com");
      expect(result.sent).toBe(true);
    });
  });

  describe("getCandidatePortal", () => {
    it("returns candidate with applications", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1", first_name: "A" }); // candidate
      mockDB.raw.mockResolvedValueOnce([[{ id: "app-1", job_title: "Dev" }]]); // applications
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "h1" }], total: 1 }); // stage history
      const result = await portalService.getCandidatePortal("c-1", ORG);
      expect(result.candidate.first_name).toBe("A");
      expect(result.applications).toHaveLength(1);
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(portalService.getCandidatePortal("x", ORG)).rejects.toThrow();
    });
  });

  describe("getApplicationStatus", () => {
    it("returns detailed application status", async () => {
      mockDB.raw.mockResolvedValueOnce([[{ id: "app-1", job_title: "Dev" }]]); // application
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "h1" }], total: 1 }); // timeline
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 }); // interviews
      mockDB.findMany.mockResolvedValueOnce({ data: [], total: 0 }); // offers
      const result = await portalService.getApplicationStatus("c-1", "app-1", ORG);
      expect(result.application.job_title).toBe("Dev");
    });

    it("throws when application not found", async () => {
      mockDB.raw.mockResolvedValueOnce([[]]); // empty
      await expect(portalService.getApplicationStatus("c-1", "x", ORG)).rejects.toThrow();
    });
  });

  describe("getUpcomingInterviews", () => {
    it("returns upcoming interviews", async () => {
      mockDB.raw.mockResolvedValueOnce([[{ id: "i1", job_title: "Dev" }]]);
      const result = await portalService.getUpcomingInterviews("c-1", ORG);
      expect(result).toHaveLength(1);
    });
  });

  describe("getPendingOffers", () => {
    it("returns pending offers", async () => {
      mockDB.raw.mockResolvedValueOnce([[{ id: "o1", job_title: "Dev" }]]);
      const result = await portalService.getPendingOffers("c-1", ORG);
      expect(result).toHaveLength(1);
    });
  });

  describe("uploadDocument", () => {
    it("uploads document for candidate", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "c-1" });
      const result = await portalService.uploadDocument("c-1", ORG, { filename: "doc.pdf" } as any);
      expect(result.path).toContain("doc.pdf");
    });

    it("throws when candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(portalService.uploadDocument("x", ORG, {} as any)).rejects.toThrow();
    });
  });
});
