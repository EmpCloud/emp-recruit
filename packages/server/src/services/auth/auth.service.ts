// ============================================================================
// AUTH SERVICE
// Handles login, registration, and token refresh for EMP Recruit.
// Users are stored in the EmpCloud master database.
// ============================================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import {
  findUserByEmail,
  findUserById,
  findOrgById,
  createOrganization,
  createUser,
} from "../../db/empcloud";
import { UnauthorizedError, ValidationError, ConflictError } from "../../utils/errors";
import { mapEmpCloudRole } from "../../api/middleware/auth.middleware";
import type { AuthPayload } from "../../api/middleware/auth.middleware";

interface LoginResult {
  user: {
    empcloudUserId: number;
    empcloudOrgId: number;
    recruitProfileId: string | null;
    role: string;
    email: string;
    firstName: string;
    lastName: string;
    orgName: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface RegisterData {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  country?: string;
}

function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as any,
  });
}

function signRefreshToken(userId: number): string {
  return jwt.sign({ userId, type: "refresh" }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry as any,
  });
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.password) {
    throw new UnauthorizedError("Password not set for this account");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    recruitProfileId: null,
    role: mapEmpCloudRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  logger.info(`User logged in: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

export async function register(data: RegisterData): Promise<LoginResult> {
  // Check if email already exists
  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create organization
  const org = await createOrganization({
    name: data.orgName,
    country: data.country || "IN",
  });

  // Create user as hr_admin of the new org
  const user = await createUser({
    organization_id: org.id,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    password: passwordHash,
    role: "hr_admin",
  });

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: org.id,
    recruitProfileId: null,
    role: mapEmpCloudRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  logger.info(`New organization registered: ${org.name} by ${user.email}`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

/**
 * SSO login: exchange an EMP Cloud JWT for a Recruit-specific HS256 JWT.
 *
 * Security model: the EMP Cloud token is signed by the master app with a key we
 * don't hold, so we can't verify its signature locally. Instead we AUTHENTICATE
 * the token against the master DB: it must carry a `jti` that resolves to a
 * live (non-revoked, non-expired) row in oauth_access_tokens. A forged token
 * can't produce a `jti` that exists in the master DB, so this is the real trust
 * boundary. Both conditions are REQUIRED — we never fall back to "trust the
 * decoded claims" (that was an auth-bypass hole).
 */
export async function ssoLogin(empcloudToken: string): Promise<LoginResult> {
  const decoded = jwt.decode(empcloudToken);
  if (!decoded || typeof decoded === "string") {
    throw new UnauthorizedError("Invalid SSO token");
  }

  const userId = Number(decoded.sub);
  if (!userId) {
    throw new UnauthorizedError("SSO token missing user id");
  }

  // REQUIRED: the token must be verifiable against the master DB. No jti or an
  // unresolvable jti means we cannot trust the token — reject it (do NOT fall
  // back to trusting the decoded payload).
  if (!decoded.jti) {
    throw new UnauthorizedError("SSO token is not verifiable (missing jti)");
  }
  const { getEmpCloudDB } = await import("../../db/empcloud");
  let empcloudDb;
  try {
    empcloudDb = getEmpCloudDB();
  } catch {
    throw new UnauthorizedError("SSO is temporarily unavailable");
  }
  const tokenRow = await empcloudDb("oauth_access_tokens")
    .where({ jti: decoded.jti })
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .first();
  if (!tokenRow) {
    throw new UnauthorizedError("Invalid or expired SSO token");
  }
  // Bind the token to its subject: the token row must belong to the same user.
  if (tokenRow.user_id != null && Number(tokenRow.user_id) !== userId) {
    throw new UnauthorizedError("SSO token does not match its subject");
  }

  const user = await findUserById(userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    recruitProfileId: null,
    role: mapEmpCloudRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshTokenValue = signRefreshToken(user.id);

  logger.info(`SSO login: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken: refreshTokenValue },
  };
}

export async function refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (decoded.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  const user = await findUserById(decoded.userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    recruitProfileId: null,
    role: mapEmpCloudRole(user.role),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
