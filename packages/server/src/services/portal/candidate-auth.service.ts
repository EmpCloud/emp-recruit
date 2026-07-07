// ============================================================================
// CANDIDATE AUTH SERVICE (Portal)
//
// OTP-first authentication for public candidates. A candidate signs in with
// just their email: we email a 6-digit code, they verify it, and we issue a
// candidate JWT. Accounts are auto-created on first OTP request. Distinct from
// recruiter auth (auth.service.ts) — candidates live in emp-recruit's own
// `candidate_accounts` table, not the EmpCloud users table.
// ============================================================================

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { sendEmail } from "../email/email.service";
import { ValidationError, UnauthorizedError, NotFoundError } from "../../utils/errors";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;

export interface CandidateTokenPayload {
  sub: string; // candidate_account id
  email: string;
  type: "candidate";
}

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function generateOtp(): string {
  // 6-digit numeric, cryptographically random, zero-padded.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function signCandidateToken(account: { id: string; email: string }): string {
  const payload: CandidateTokenPayload = {
    sub: account.id,
    email: account.email,
    type: "candidate",
  };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: (config.jwt.accessExpiry as any) || "7d",
  });
}

export function verifyCandidateToken(token: string): CandidateTokenPayload {
  const decoded = jwt.verify(token, config.jwt.secret) as CandidateTokenPayload;
  if (decoded.type !== "candidate") {
    throw new UnauthorizedError("Not a candidate token");
  }
  return decoded;
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function validatePassword(pw: string): void {
  if (!pw || pw.length < 8) throw new ValidationError("Password must be at least 8 characters");
}

// ---------------------------------------------------------------------------
// REGISTER — create a candidate account with email + password + name.
// This is the sign-up path. Email must be unique.
// ---------------------------------------------------------------------------
export async function register(params: {
  email: string;
  password: string;
  first_name: string;
  last_name?: string;
  phone?: string;
}): Promise<{ token: string; account: any; dev_code?: string }> {
  const knex = getDB().knex();
  const email = normalizeEmail(params.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("A valid email is required");
  }
  if (!params.first_name?.trim()) throw new ValidationError("First name is required");
  validatePassword(params.password);

  const existing = await knex("candidate_accounts").where({ email }).first();
  if (existing) {
    throw new ValidationError("An account with this email already exists. Please sign in instead.");
  }

  const id = uuidv4();
  await knex("candidate_accounts").insert({
    id,
    email,
    first_name: params.first_name.trim(),
    last_name: params.last_name?.trim() || null,
    phone: params.phone?.trim() || null,
    password_hash: await bcrypt.hash(params.password, 12),
    email_verified: false,
    status: "active",
    last_login_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  });
  const account = await knex("candidate_accounts").where({ id }).first();
  logger.info(`New candidate registered: ${email}`);

  // Send an email-verification code. The candidate is signed in immediately
  // (so they can browse/apply), but their email shows as unverified until they
  // enter the code — surfaced via account.email_verified.
  const devCode = await sendVerificationCode(email);
  return { token: signCandidateToken(account), account: sanitize(account), dev_code: devCode };
}

// ---------------------------------------------------------------------------
// LOGIN — email + password. The primary authentication path.
// ---------------------------------------------------------------------------
export async function passwordLogin(rawEmail: string, password: string): Promise<{ token: string; account: any }> {
  const knex = getDB().knex();
  const email = normalizeEmail(rawEmail);
  const account = await knex("candidate_accounts").where({ email }).first();
  if (!account || !account.password_hash) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (account.status === "suspended") throw new UnauthorizedError("This account is suspended");
  const ok = await bcrypt.compare(password, account.password_hash);
  if (!ok) throw new UnauthorizedError("Invalid email or password");
  await knex("candidate_accounts").where({ id: account.id }).update({ last_login_at: new Date(), updated_at: new Date() });
  return { token: signCandidateToken(account), account: sanitize(account) };
}

// ---------------------------------------------------------------------------
// EMAIL VERIFICATION — mint + email a 6-digit code (purpose "verify").
// Called at register time and by "resend". Returns the dev code in non-prod.
// ---------------------------------------------------------------------------
async function sendVerificationCode(email: string): Promise<string | undefined> {
  const knex = getDB().knex();
  // Invalidate outstanding verify codes, mint a fresh one.
  await knex("candidate_otps").where({ email, purpose: "verify" }).whereNull("consumed_at").update({ consumed_at: new Date() });
  const code = generateOtp();
  await knex("candidate_otps").insert({
    id: uuidv4(),
    email,
    code_hash: sha256(code),
    purpose: "verify",
    attempts: 0,
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    created_at: new Date(),
  });
  try {
    await sendEmail(email, "Verify your email — EMP Recruit", verifyEmailHtml(code, OTP_TTL_MINUTES));
  } catch (err) {
    logger.warn(`Verification email failed for ${email}: ${(err as Error).message}`);
  }
  return config.env !== "production" ? code : undefined;
}

// Resend the verification code (authenticated candidate).
export async function resendVerification(accountId: string): Promise<{ expires_in: number; dev_code?: string }> {
  const knex = getDB().knex();
  const account = await knex("candidate_accounts").where({ id: accountId }).first();
  if (!account) throw new NotFoundError("Account");
  if (account.email_verified) throw new ValidationError("Email already verified");

  const recent = await knex("candidate_otps")
    .where({ email: account.email, purpose: "verify" })
    .andWhere("created_at", ">", knex.raw(`DATE_SUB(NOW(), INTERVAL ? SECOND)`, [OTP_RESEND_COOLDOWN_SECONDS]))
    .first();
  if (recent) throw new ValidationError(`Please wait ${OTP_RESEND_COOLDOWN_SECONDS}s before requesting another code`);

  const devCode = await sendVerificationCode(account.email);
  return { expires_in: OTP_TTL_MINUTES * 60, dev_code: devCode };
}

// ---------------------------------------------------------------------------
// VERIFY EMAIL — confirm the 6-digit code, mark the account email_verified.
// (authenticated candidate — verifies their OWN email)
// ---------------------------------------------------------------------------
export async function verifyEmail(accountId: string, code: string): Promise<any> {
  const knex = getDB().knex();
  const account = await knex("candidate_accounts").where({ id: accountId }).first();
  if (!account) throw new NotFoundError("Account");
  if (account.email_verified) return sanitize(account);

  const otp = await knex("candidate_otps")
    .where({ email: account.email, purpose: "verify" })
    .whereNull("consumed_at")
    .orderBy("created_at", "desc")
    .first();
  if (!otp) throw new ValidationError("No active code — please resend the verification code");
  if (new Date(otp.expires_at) < new Date()) throw new ValidationError("This code has expired — please resend it");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new ValidationError("Too many attempts — please resend the code");
  if (otp.code_hash !== sha256(String(code || "").trim())) {
    await knex("candidate_otps").where({ id: otp.id }).increment("attempts", 1);
    throw new ValidationError("Incorrect code");
  }

  await knex("candidate_otps").where({ id: otp.id }).update({ consumed_at: new Date() });
  await knex("candidate_accounts").where({ id: account.id }).update({ email_verified: true, updated_at: new Date() });
  logger.info(`Candidate email verified: ${account.email}`);
  return sanitize({ ...account, email_verified: 1 });
}

// ---------------------------------------------------------------------------
// Profile read/update (self)
// ---------------------------------------------------------------------------
export async function getProfile(accountId: string): Promise<any> {
  const db = getDB();
  const account = await db.knex()("candidate_accounts").where({ id: accountId }).first();
  if (!account) throw new NotFoundError("Account");
  return sanitize(account);
}

const PROFILE_FIELDS = [
  "first_name", "last_name", "phone", "headline", "location",
  "current_company", "current_title", "experience_years",
  "linkedin_url", "portfolio_url", "skills", "default_resume_id",
];

export async function updateProfile(accountId: string, data: Record<string, any>): Promise<any> {
  const db = getDB();
  const knex = db.knex();
  const update: Record<string, any> = { updated_at: new Date() };
  for (const f of PROFILE_FIELDS) {
    if (data[f] !== undefined) {
      update[f] = f === "skills" && Array.isArray(data[f]) ? JSON.stringify(data[f]) : data[f];
    }
  }
  await knex("candidate_accounts").where({ id: accountId }).update(update);
  return getProfile(accountId);
}

export async function setPassword(accountId: string, password: string): Promise<void> {
  if (!password || password.length < 8) throw new ValidationError("Password must be at least 8 characters");
  const db = getDB();
  await db.knex()("candidate_accounts").where({ id: accountId }).update({
    password_hash: await bcrypt.hash(password, 12),
    updated_at: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sanitize(account: any): any {
  if (!account) return account;
  const { password_hash, ...safe } = account;
  if (typeof safe.skills === "string") {
    try { safe.skills = JSON.parse(safe.skills); } catch { safe.skills = []; }
  }
  safe.email_verified = !!safe.email_verified;
  // Tell the client whether a password is set (without leaking the hash) so the
  // UI can prompt the candidate to set one after an OTP sign-in.
  safe.has_password = !!password_hash;
  return safe;
}

function verifyEmailHtml(code: string, ttlMin: number): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 8px;color:#111827">Verify your email</h2>
    <p style="color:#4b5563;margin:0 0 20px">Welcome! Enter this code to verify your email address. It expires in ${ttlMin} minutes.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:12px;padding:16px;text-align:center;color:#111827">${code}</div>
    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">If you didn't create an account, you can safely ignore this email.</p>
  </div>`;
}
