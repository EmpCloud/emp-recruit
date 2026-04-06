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
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    unlinkSync: vi.fn(),
  },
}));

import { __mockDB } from "../../db/adapters";
const mockDB = __mockDB as any;

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
});

// ── Recording Service ────────────────────────────────────────────────
import * as recordingService from "../../services/interview/recording.service";

describe("Recording Service", () => {
  describe("uploadRecording", () => {
    it("uploads recording for interview", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "int-1" }); // interview
      mockDB.create.mockResolvedValueOnce({ id: "rec-1", file_path: "/uploads/rec.mp4" });
      const result = await recordingService.uploadRecording(ORG, "int-1", {
        path: "/uploads/rec.mp4", size: 1024, mimetype: "video/mp4",
      } as any, 1);
      expect(result.file_path).toContain("rec.mp4");
    });

    it("throws when interview not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(recordingService.uploadRecording(ORG, "x", {} as any, 1)).rejects.toThrow();
    });
  });

  describe("getRecording", () => {
    it("returns recording", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "rec-1" });
      const result = await recordingService.getRecording(ORG, "rec-1");
      expect(result.id).toBe("rec-1");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(recordingService.getRecording(ORG, "x")).rejects.toThrow();
    });
  });

  describe("getRecordings", () => {
    it("returns recordings for interview", async () => {
      mockDB.findMany.mockResolvedValueOnce({ data: [{ id: "r1" }], total: 1 });
      const result = await recordingService.getRecordings(ORG, "int-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("deleteRecording", () => {
    it("deletes recording and associated transcripts", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "rec-1", file_path: "/uploads/rec.mp4" });
      mockDB.deleteMany.mockResolvedValueOnce(1);
      mockDB.delete.mockResolvedValueOnce(true);
      await recordingService.deleteRecording(ORG, "rec-1");
      expect(mockDB.deleteMany).toHaveBeenCalledWith("interview_transcripts", { recording_id: "rec-1" });
      expect(mockDB.delete).toHaveBeenCalledWith("interview_recordings", "rec-1");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(recordingService.deleteRecording(ORG, "x")).rejects.toThrow();
    });
  });

  describe("generateTranscript", () => {
    it("generates placeholder transcript", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "rec-1", file_path: "/rec.mp4" }); // recording
      mockDB.create.mockResolvedValueOnce({ id: "tr-1", status: "completed", content: "[00:00:00]" });
      const result = await recordingService.generateTranscript(ORG, "int-1", "rec-1");
      expect(result.status).toBe("completed");
    });

    it("throws when recording not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(recordingService.generateTranscript(ORG, "int-1", "x")).rejects.toThrow();
    });
  });

  describe("getTranscript", () => {
    it("returns transcript", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "tr-1", content: "..." });
      const result = await recordingService.getTranscript(ORG, "int-1");
      expect(result?.id).toBe("tr-1");
    });

    it("returns null when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      const result = await recordingService.getTranscript(ORG, "int-1");
      expect(result).toBeNull();
    });
  });

  describe("updateTranscriptSummary", () => {
    it("updates summary", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "tr-1" });
      mockDB.update.mockResolvedValueOnce({ id: "tr-1", summary: "Good candidate" });
      const result = await recordingService.updateTranscriptSummary(ORG, "tr-1", "Good candidate");
      expect(result.summary).toBe("Good candidate");
    });

    it("throws when not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(recordingService.updateTranscriptSummary(ORG, "x", "s")).rejects.toThrow();
    });
  });
});

// ── Calendar Service ─────────────────────────────────────────────────
import { generateCalendarLinks, generateICSContent, getCalendarLinks, generateICSFile, resolveInterviewContext } from "../../services/interview/calendar.service";

describe("Calendar Service", () => {
  const interview: any = {
    id: "int-1", scheduled_at: "2026-06-01T10:00:00Z", duration_minutes: 60,
    type: "video", round: 1, location: "Room 5", meeting_link: "https://meet.jit.si/test",
    notes: "Bring ID", application_id: "app-1",
  };

  describe("generateCalendarLinks", () => {
    it("generates google, outlook, and office365 links", () => {
      const links = generateCalendarLinks(interview, "John Doe", "Engineer", "TestOrg");
      expect(links.google).toContain("calendar.google.com");
      expect(links.outlook).toContain("outlook.live.com");
      expect(links.office365).toContain("outlook.office.com");
    });

    it("handles missing meeting_link and location", () => {
      const i2 = { ...interview, location: null, meeting_link: null };
      const links = generateCalendarLinks(i2, "Jane", "Dev", "Org");
      expect(links.google).toBeTruthy();
    });
  });

  describe("generateICSContent", () => {
    it("generates valid ICS content", () => {
      const ics = generateICSContent(interview, "John", "Dev", "Org");
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("John");
    });

    it("handles interview without meeting_link", () => {
      const i2 = { ...interview, meeting_link: null, notes: null };
      const ics = generateICSContent(i2, "J", "D", "O");
      expect(ics).toContain("BEGIN:VCALENDAR");
    });
  });

  describe("resolveInterviewContext", () => {
    it("resolves candidate name and job title", async () => {
      mockDB.findById.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1", job_id: "j-1" });
      mockDB.findById.mockResolvedValueOnce({ first_name: "Jane", last_name: "Doe" });
      mockDB.findById.mockResolvedValueOnce({ title: "Developer" });
      const result = await resolveInterviewContext("app-1");
      expect(result.candidateName).toBe("Jane Doe");
      expect(result.jobTitle).toBe("Developer");
    });

    it("returns defaults when application not found", async () => {
      mockDB.findById.mockResolvedValueOnce(null);
      const result = await resolveInterviewContext("x");
      expect(result.candidateName).toBe("Candidate");
      expect(result.jobTitle).toBe("Open Position");
    });
  });

  describe("getCalendarLinks", () => {
    it("returns calendar links for interview", async () => {
      mockDB.findOne.mockResolvedValueOnce(interview); // interview
      mockDB.findById.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1", job_id: "j-1" });
      mockDB.findById.mockResolvedValueOnce({ first_name: "A", last_name: "B" });
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" });
      const { findOrgById } = await import("../../db/empcloud");
      (findOrgById as any).mockResolvedValueOnce({ id: ORG, name: "TestOrg" });
      const links = await getCalendarLinks(ORG, "int-1");
      expect(links.google).toContain("calendar.google.com");
    });

    it("throws when interview not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(getCalendarLinks(ORG, "x")).rejects.toThrow();
    });
  });

  describe("generateICSFile", () => {
    it("generates ICS file for interview", async () => {
      mockDB.findOne.mockResolvedValueOnce(interview);
      mockDB.findById.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1", job_id: "j-1" });
      mockDB.findById.mockResolvedValueOnce({ first_name: "A", last_name: "B" });
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" });
      const { findOrgById } = await import("../../db/empcloud");
      (findOrgById as any).mockResolvedValueOnce({ id: ORG, name: "TestOrg" });
      const ics = await generateICSFile(ORG, "int-1");
      expect(ics).toContain("BEGIN:VCALENDAR");
    });

    it("throws when interview not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(generateICSFile(ORG, "x")).rejects.toThrow();
    });
  });
});

// ── Invitation Service ───────────────────────────────────────────────
import * as invitationService from "../../services/interview/invitation.service";

describe("Invitation Service", () => {
  describe("sendInterviewInvitation", () => {
    it("sends email to candidate and panelists", async () => {
      mockDB.findOne.mockResolvedValueOnce({
        id: "int-1", application_id: "app-1", scheduled_at: "2026-06-01T10:00:00Z",
        duration_minutes: 60, type: "video", round: 1, meeting_link: "https://meet.jit.si/test",
        location: "Room A", notes: null,
      }); // interview
      mockDB.findById.mockResolvedValueOnce({ id: "app-1", candidate_id: "c-1", job_id: "j-1" }); // application
      mockDB.findById.mockResolvedValueOnce({ id: "c-1", first_name: "John", last_name: "Doe", email: "j@d.com" }); // candidate
      mockDB.findById.mockResolvedValueOnce({ title: "Dev" }); // job
      const { findOrgById } = await import("../../db/empcloud");
      (findOrgById as any).mockResolvedValueOnce({ id: ORG, name: "TestOrg" });
      // panelists
      mockDB.findMany.mockResolvedValueOnce({ data: [{ user_id: 10 }], total: 1 });
      const { findUserById } = await import("../../db/empcloud");
      (findUserById as any).mockResolvedValueOnce({ id: 10, email: "pan@t.com", first_name: "P" });
      const result = await invitationService.sendInterviewInvitation(ORG, "int-1");
      expect(result.sent_to).toContain("j@d.com");
      expect(result.sent_to).toContain("pan@t.com");
    });

    it("throws when interview not found", async () => {
      mockDB.findOne.mockResolvedValueOnce(null);
      await expect(invitationService.sendInterviewInvitation(ORG, "x")).rejects.toThrow();
    });

    it("throws when application not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "int-1", application_id: "app-1" });
      mockDB.findById.mockResolvedValueOnce(null); // application
      await expect(invitationService.sendInterviewInvitation(ORG, "int-1")).rejects.toThrow();
    });
  });
});
