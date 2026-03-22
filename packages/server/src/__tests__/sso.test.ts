// ============================================================================
// SSO LOGIN — UNIT TESTS
// Tests the token-exchange flow: EMP Cloud RS256 JWT → Recruit HS256 JWT.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------
const mockFindUserById = vi.fn();
const mockFindOrgById = vi.fn();

vi.mock("../db/empcloud", () => ({
  findUserById: (...args: any[]) => mockFindUserById(...args),
  findUserByEmail: vi.fn(),
  findOrgById: (...args: any[]) => mockFindOrgById(...args),
  createOrganization: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("../config", () => ({
  config: {
    jwt: {
      secret: "test-secret-key",
      accessExpiry: "15m",
      refreshExpiry: "7d",
    },
  },
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { ssoLogin } from "../services/auth/auth.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_SECRET = "test-secret-key";

/** Build a fake EMP Cloud RS256-style JWT (we just need a decodable token). */
function buildEmpCloudToken(payload: Record<string, any>): string {
  // Sign with a *different* secret to simulate that the recruit server
  // cannot jwt.verify() this token — only jwt.decode().
  return jwt.sign(payload, "empcloud-rs256-private-key-not-shared", {
    algorithm: "HS256", // stand-in for RS256 in tests
  });
}

const fakeUser = {
  id: 42,
  organization_id: 7,
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@acme.com",
  password: "$2a$12$hashed",
  role: "hr_admin",
  status: 1,
  emp_code: "E001",
  contact_number: null,
  date_of_birth: null,
  gender: null,
  date_of_joining: "2024-01-01",
  date_of_exit: null,
  designation: "HR Manager",
  department_id: null,
  location_id: null,
  reporting_manager_id: null,
  employment_type: "full_time",
  created_at: new Date(),
  updated_at: new Date(),
};

const fakeOrg = {
  id: 7,
  name: "Acme Corp",
  legal_name: "Acme Corp Ltd",
  email: "admin@acme.com",
  contact_number: null,
  timezone: "Asia/Kolkata",
  country: "IN",
  state: null,
  city: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ssoLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a valid EMP Cloud token for Recruit tokens", async () => {
    mockFindUserById.mockResolvedValue(fakeUser);
    mockFindOrgById.mockResolvedValue(fakeOrg);

    const empcloudToken = buildEmpCloudToken({
      sub: 42,
      org_id: 7,
      email: "jane@acme.com",
      role: "hr_admin",
      first_name: "Jane",
      last_name: "Doe",
      org_name: "Acme Corp",
    });

    const result = await ssoLogin(empcloudToken);

    // Verify user was looked up by sub claim
    expect(mockFindUserById).toHaveBeenCalledWith(42);
    expect(mockFindOrgById).toHaveBeenCalledWith(7);

    // Verify response structure
    expect(result.user).toMatchObject({
      empcloudUserId: 42,
      empcloudOrgId: 7,
      email: "jane@acme.com",
      role: "hr_admin",
      firstName: "Jane",
      lastName: "Doe",
      orgName: "Acme Corp",
      recruitProfileId: null,
    });

    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();

    // The returned tokens should be verifiable with the RECRUIT secret
    const decoded = jwt.verify(result.tokens.accessToken, TEST_SECRET) as any;
    expect(decoded.empcloudUserId).toBe(42);
    expect(decoded.email).toBe("jane@acme.com");
  });

  it("rejects a non-JWT string", async () => {
    await expect(ssoLogin("not-a-jwt")).rejects.toThrow("Invalid SSO token");
  });

  it("rejects when user is not found", async () => {
    mockFindUserById.mockResolvedValue(null);

    const token = buildEmpCloudToken({ sub: 999, org_id: 1 });
    await expect(ssoLogin(token)).rejects.toThrow("User not found or inactive");
  });

  it("rejects when user is inactive", async () => {
    mockFindUserById.mockResolvedValue({ ...fakeUser, status: 0 });

    const token = buildEmpCloudToken({ sub: 42, org_id: 7 });
    await expect(ssoLogin(token)).rejects.toThrow("User not found or inactive");
  });

  it("rejects when organization is inactive", async () => {
    mockFindUserById.mockResolvedValue(fakeUser);
    mockFindOrgById.mockResolvedValue({ ...fakeOrg, is_active: false });

    const token = buildEmpCloudToken({ sub: 42, org_id: 7 });
    await expect(ssoLogin(token)).rejects.toThrow("Organization is inactive");
  });

  it("rejects when token has no sub claim", async () => {
    const token = buildEmpCloudToken({ org_id: 7, email: "jane@acme.com" });
    await expect(ssoLogin(token)).rejects.toThrow("SSO token missing user id");
  });
});
