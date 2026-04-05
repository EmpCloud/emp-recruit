/**
 * EMP Recruit — Infrastructure coverage tests.
 * Error classes, response helpers.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from "../utils/errors";

describe("Error classes", () => {
  describe("AppError", () => {
    it("sets statusCode, code, message", () => {
      const err = new AppError(500, "INTERNAL", "Fail");
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe("INTERNAL");
      expect(err.message).toBe("Fail");
      expect(err.name).toBe("AppError");
    });

    it("stores details", () => {
      const err = new AppError(400, "X", "Y", { f: ["required"] });
      expect(err.details).toEqual({ f: ["required"] });
    });
  });

  describe("NotFoundError", () => {
    it("creates 404 with resource and id", () => {
      const err = new NotFoundError("Candidate", "42");
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain("Candidate");
      expect(err.message).toContain("42");
    });

    it("creates 404 without id", () => {
      expect(new NotFoundError("Job").message).toBe("Job not found");
    });
  });

  describe("ValidationError", () => {
    it("creates 400 with VALIDATION_ERROR", () => {
      const err = new ValidationError("Invalid");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("includes details", () => {
      const d = { email: ["invalid"] };
      expect(new ValidationError("Bad", d).details).toEqual(d);
    });
  });

  describe("UnauthorizedError", () => {
    it("defaults to Unauthorized", () => {
      expect(new UnauthorizedError().message).toBe("Unauthorized");
      expect(new UnauthorizedError().statusCode).toBe(401);
    });
  });

  describe("ForbiddenError", () => {
    it("creates 403", () => {
      expect(new ForbiddenError().statusCode).toBe(403);
    });
  });

  describe("ConflictError", () => {
    it("creates 409", () => {
      expect(new ConflictError("Exists").statusCode).toBe(409);
    });
  });
});

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------
import { sendSuccess, sendError, sendPaginated } from "../utils/response";

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

describe("Response helpers", () => {
  it("sendSuccess sends 200 by default", () => {
    const res = mockRes();
    sendSuccess(res, { created: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sendSuccess accepts custom status", () => {
    const res = mockRes();
    sendSuccess(res, null, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("sendError sends error envelope", () => {
    const res = mockRes();
    sendError(res, 404, "NOT_FOUND", "Not here");
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "Not here" },
    });
  });

  it("sendPaginated calculates totalPages", () => {
    const res = mockRes();
    sendPaginated(res, ["a"], 25, 2, 10);
    const body = res.json.mock.calls[0][0];
    expect(body.data.totalPages).toBe(3);
    expect(body.data.page).toBe(2);
  });

  it("sendPaginated handles zero", () => {
    const res = mockRes();
    sendPaginated(res, [], 0, 1, 10);
    expect(res.json.mock.calls[0][0].data.totalPages).toBe(0);
  });
});
