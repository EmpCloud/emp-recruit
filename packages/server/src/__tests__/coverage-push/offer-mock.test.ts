import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB adapter (inline in factory to avoid hoisting issues) ──────
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
  findUserById: vi.fn().mockResolvedValue({ id: 1, organization_id: 5, email: "t@t.com", first_name: "A", last_name: "B", role: "hr_admin", status: 1 }),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg", is_active: true }),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Get mock reference after import ──────────────────────────────────
import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

import * as offerService from "../../services/offer/offer.service";

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
});

// ─── offer.service ───────────────────────────────────────────────────────

describe("Offer Service", () => {
  const baseOffer: any = {
    id: "off-1", organization_id: ORG, application_id: "app-1",
    candidate_id: "c-1", job_id: "j-1", status: "draft",
    salary_amount: 100000, salary_currency: "INR",
    joining_date: "2026-06-01", expiry_date: "2026-05-20",
    job_title: "Engineer", notes: null, created_by: 1,
  };

  describe("createOffer", () => {
    it("creates offer when application exists and no active offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", organization_id: ORG, candidate_id: "c-1", job_id: "j-1" });
      mockDB.findOne.mockResolvedValueOnce(null);
      mockDB.create.mockResolvedValueOnce({ ...baseOffer });
      mockDB.update.mockResolvedValueOnce({});
      const result = await offerService.createOffer(ORG, {
        application_id: "app-1", salary_amount: 100000, salary_currency: "INR",
        joining_date: "2026-06-01", expiry_date: "2026-05-20", job_title: "Engineer", created_by: 1,
      });
      expect(result.id).toBe("off-1");
    });

    it("throws NotFoundError when application missing", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerService.createOffer(ORG, {
        application_id: "x", salary_amount: 1, salary_currency: "INR",
        joining_date: "2026-06-01", expiry_date: "2026-05-20", job_title: "E", created_by: 1,
      })).rejects.toThrow();
    });

    it("throws ValidationError when active offer exists", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", organization_id: ORG, candidate_id: "c-1", job_id: "j-1" });
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      await expect(offerService.createOffer(ORG, {
        application_id: "app-1", salary_amount: 1, salary_currency: "INR",
        joining_date: "2026-06-01", expiry_date: "2026-05-20", job_title: "E", created_by: 1,
      })).rejects.toThrow(/active offer/i);
    });

    it("allows when existing is declined", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "app-1", organization_id: ORG, candidate_id: "c-1", job_id: "j-1" });
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "declined" });
      mockDB.create.mockResolvedValueOnce({ ...baseOffer, id: "off-2" });
      mockDB.update.mockResolvedValueOnce({});
      const result = await offerService.createOffer(ORG, {
        application_id: "app-1", salary_amount: 1, salary_currency: "INR",
        joining_date: "2026-06-01", expiry_date: "2026-05-20", job_title: "E", created_by: 1,
      });
      expect(result.id).toBe("off-2");
    });
  });

  describe("updateOffer", () => {
    it("updates a draft offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, salary_amount: 200000 });
      const result = await offerService.updateOffer(ORG, "off-1", { salary_amount: 200000 });
      expect(result.salary_amount).toBe(200000);
    });

    it("throws when offer not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerService.updateOffer(ORG, "x", {})).rejects.toThrow();
    });

    it("throws when not draft", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      await expect(offerService.updateOffer(ORG, "off-1", {})).rejects.toThrow(/draft/i);
    });
  });

  describe("getOffer", () => {
    it("returns offer with approvers", async () => {
      mockDB.findOne.mockResolvedValueOnce(baseOffer);
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "a1" }], total: 1 });
      const result = await offerService.getOffer(ORG, "off-1");
      expect(result.approvers).toHaveLength(1);
    });
  });

  describe("listOffers", () => {
    it("returns enriched offers", async () => {
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ ...baseOffer, candidate_id: "c-1", job_id: "j-1" }],
        total: 1, page: 1, limit: 20, totalPages: 1,
      });
      mockDB.findById.mockResolvedValueOnce({ first_name: "A", last_name: "B" });
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" });
      const result = await offerService.listOffers(ORG, {});
      expect(result.data[0].candidate_name).toBe("A B");
    });
  });

  describe("submitForApproval", () => {
    it("creates approver records and updates status", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      mockDB.create.mockResolvedValue({});
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      const result = await offerService.submitForApproval(ORG, "off-1", [1, 2]);
      expect(result.status).toBe("pending_approval");
    });

    it("throws when not draft", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      await expect(offerService.submitForApproval(ORG, "off-1", [1])).rejects.toThrow(/draft/i);
    });

    it("throws when no approvers", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      await expect(offerService.submitForApproval(ORG, "off-1", [])).rejects.toThrow(/approver/i);
    });
  });

  describe("approve", () => {
    it("approves when all done", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      mockDB.findOne.mockResolvedValueOnce({ id: "ap1", status: "pending" });
      mockDB.update.mockResolvedValueOnce({});
      mockDB.count.mockResolvedValueOnce(0);
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "approved" });
      const result = await offerService.approve(ORG, "off-1", 1);
      expect(result.status).toBe("approved");
    });

    it("returns current when still pending", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      mockDB.findOne.mockResolvedValueOnce({ id: "ap1", status: "pending" });
      mockDB.update.mockResolvedValueOnce({});
      mockDB.count.mockResolvedValueOnce(1);
      mockDB.findById.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      const result = await offerService.approve(ORG, "off-1", 1);
      expect(result.status).toBe("pending_approval");
    });

    it("throws if not approver", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(offerService.approve(ORG, "off-1", 99)).rejects.toThrow();
    });

    it("throws when already acted", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      mockDB.findOne.mockResolvedValueOnce({ id: "ap1", status: "approved" });
      await expect(offerService.approve(ORG, "off-1", 1)).rejects.toThrow(/already/i);
    });
  });

  describe("reject", () => {
    it("rejects offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "pending_approval" });
      mockDB.findOne.mockResolvedValueOnce({ id: "ap1" });
      mockDB.update.mockResolvedValueOnce({});
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      const result = await offerService.reject(ORG, "off-1", 1);
      expect(result.status).toBe("draft");
    });
  });

  describe("sendOffer", () => {
    it("sends approved offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "approved" });
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      const result = await offerService.sendOffer(ORG, "off-1");
      expect(result.status).toBe("sent");
    });

    it("throws when not approved", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      await expect(offerService.sendOffer(ORG, "off-1")).rejects.toThrow(/approved/i);
    });
  });

  describe("revokeOffer", () => {
    it("revokes sent offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "revoked" });
      const result = await offerService.revokeOffer(ORG, "off-1");
      expect(result.status).toBe("revoked");
    });

    it("throws for draft", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      await expect(offerService.revokeOffer(ORG, "off-1")).rejects.toThrow();
    });
  });

  describe("acceptOffer", () => {
    it("accepts sent offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "accepted" });
      mockDB.update.mockResolvedValueOnce({});
      const result = await offerService.acceptOffer(ORG, "off-1");
      expect(result.status).toBe("accepted");
    });

    it("throws when not sent", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "draft" });
      await expect(offerService.acceptOffer(ORG, "off-1")).rejects.toThrow(/sent/i);
    });
  });

  describe("declineOffer", () => {
    it("declines sent offer", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "sent" });
      mockDB.update.mockResolvedValueOnce({ ...baseOffer, status: "declined" });
      const result = await offerService.declineOffer(ORG, "off-1");
      expect(result.status).toBe("declined");
    });

    it("throws when not sent", async () => {
      mockDB.findOne.mockResolvedValueOnce({ ...baseOffer, status: "approved" });
      await expect(offerService.declineOffer(ORG, "off-1")).rejects.toThrow(/sent/i);
    });
  });
});
