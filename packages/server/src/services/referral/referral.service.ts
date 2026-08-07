// ============================================================================
// REFERRAL SERVICE
// Employee referrals: submit, list, update status, track bonuses.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { Referral, Candidate, Application, JobPosting } from "@emp-recruit/shared";

interface SubmitReferralData {
  job_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  relationship?: string;
  notes?: string;
  resume_path?: string;
}

interface ListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  referrerId?: number; // for employee: show only own referrals
  jobId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export async function submitReferral(
  orgId: number,
  userId: number,
  data: SubmitReferralData,
): Promise<Referral> {
  const db = getDB();

  // Validate job exists and is open
  const job = await db.findOne<JobPosting>("job_postings", {
    id: data.job_id,
    organization_id: orgId,
    status: "open",
  });
  if (!job) {
    throw new NotFoundError("Job posting", data.job_id);
  }

  // Check if candidate already exists in this org
  let candidate = await db.findOne<Candidate>("candidates", {
    organization_id: orgId,
    email: data.email,
  });

  if (!candidate) {
    candidate = await db.create<Candidate>("candidates", {
      organization_id: orgId,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || null,
      source: "referral",
      resume_path: data.resume_path || null,
    } as Partial<Candidate>);
  }

  // #1361 — Prevent duplicate applications for the same candidate/job
  const existingApplication = await db.findOne<Application>("applications", {
    organization_id: orgId,
    job_id: data.job_id,
    candidate_id: candidate.id,
  });
  if (existingApplication) {
    throw new ValidationError("You have already applied for this job");
  }

  // Create application linked to referral
  const application = await db.create<Application>("applications", {
    organization_id: orgId,
    job_id: data.job_id,
    candidate_id: candidate.id,
    stage: "applied",
    source: "referral",
  } as Partial<Application>);

  // Create referral record
  const referral = await db.create<Referral>("referrals", {
    organization_id: orgId,
    job_id: data.job_id,
    referrer_id: userId,
    candidate_id: candidate.id,
    application_id: application.id,
    status: "submitted",
    relationship: data.relationship || null,
    notes: data.notes || null,
  } as Partial<Referral>);

  // Log stage history
  await db.create("application_stage_history", {
    application_id: application.id,
    from_stage: null,
    to_stage: "applied",
    changed_by: userId,
    notes: "Referred by employee",
  });

  logger.info(`Referral submitted by user ${userId} for ${data.email} to job ${job.title}`);

  return referral;
}

/**
 * `status` may be a single value or a comma-separated list, so a dashboard card
 * whose count spans several statuses can deep-link to a matching list.
 */
function parseStatuses(status?: string): string[] {
  if (!status) return [];
  return status
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getReferralStats(orgId: number, referrerId?: number): Promise<{
  total: number;
  underReview: number;
  bonusEligible: number;
  bonusPaid: number;
}> {
  const db = getDB();
  const referrerClause = referrerId ? " AND referrer_id = ?" : "";
  const args = referrerId ? [orgId, referrerId] : [orgId];
  const rows = await db.raw<any[][]>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status IN ('submitted', 'under_review') THEN 1 ELSE 0 END) AS underReview,
       SUM(CASE WHEN status = 'bonus_eligible' THEN 1 ELSE 0 END) AS bonusEligible,
       SUM(CASE WHEN status = 'bonus_paid' THEN 1 ELSE 0 END) AS bonusPaid
     FROM referrals WHERE organization_id = ?${referrerClause}`,
    args,
  );
  const stats = rows[0]?.[0] ?? {};
  return {
    total: Number(stats.total ?? 0),
    underReview: Number(stats.underReview ?? 0),
    bonusEligible: Number(stats.bonusEligible ?? 0),
    bonusPaid: Number(stats.bonusPaid ?? 0),
  };
}

export async function listReferrals(
  orgId: number,
  params: ListParams,
): Promise<{ data: any[]; total: number; page: number; perPage: number; totalPages: number }> {
  const db = getDB();
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const conditions = ["r.organization_id = ?"];
  const args: any[] = [orgId];

  const statuses = parseStatuses(params.status);
  if (statuses.length) {
    conditions.push(`r.status IN (${statuses.map(() => "?").join(",")})`);
    args.push(...statuses);
  }
  if (params.referrerId) { conditions.push("r.referrer_id = ?"); args.push(params.referrerId); }
  if (params.jobId) { conditions.push("r.job_id = ?"); args.push(params.jobId); }
  if (params.dateFrom) { conditions.push("DATE(r.created_at) >= ?"); args.push(params.dateFrom); }
  if (params.dateTo) { conditions.push("DATE(r.created_at) <= ?"); args.push(params.dateTo); }
  if (params.search?.trim()) {
    const like = `%${params.search.trim()}%`;
    conditions.push("(c.first_name LIKE ? OR c.last_name LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR c.email LIKE ? OR j.title LIKE ?)");
    args.push(like, like, like, like, like);
  }

  const where = conditions.join(" AND ");
  const sortColumns: Record<string, string> = { created_at: "r.created_at", status: "r.status", bonus_amount: "r.bonus_amount" };
  const sortColumn = sortColumns[params.sort || "created_at"] || "r.created_at";
  const direction = params.order === "asc" ? "ASC" : "DESC";

  const countRows = await db.raw<any[][]>(
    `SELECT COUNT(*) AS total FROM referrals r
     JOIN candidates c ON c.id = r.candidate_id
     JOIN job_postings j ON j.id = r.job_id
     WHERE ${where}`,
    args,
  );
  const dataRows = await db.raw<any[][]>(
    `SELECT r.*, CONCAT(c.first_name, ' ', c.last_name) AS candidate_name,
            c.email AS candidate_email, j.title AS job_title, j.department AS job_department,
            a.stage AS application_stage
     FROM referrals r
     JOIN candidates c ON c.id = r.candidate_id
     JOIN job_postings j ON j.id = r.job_id
     LEFT JOIN applications a ON a.id = r.application_id
     WHERE ${where}
     ORDER BY ${sortColumn} ${direction}
     LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
  const total = Number(countRows[0]?.[0]?.total ?? 0);
  return { data: dataRows[0], total, page, perPage: limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
export async function updateReferralStatus(
  orgId: number,
  id: string,
  status: string,
  bonusAmount?: number,
): Promise<Referral> {
  const db = getDB();

  const referral = await db.findOne<Referral>("referrals", { id, organization_id: orgId });
  if (!referral) {
    throw new NotFoundError("Referral", id);
  }

  // A paid bonus is terminal — block re-paying or amount changes so a bonus
  // can't be re-recorded repeatedly or edited after payment (audit M13).
  if (referral.status === "bonus_paid") {
    throw new ValidationError("This referral bonus has already been paid and cannot be changed");
  }

  const updateData: Partial<Referral> = { status } as Partial<Referral>;

  if (bonusAmount !== undefined) {
    if (!Number.isInteger(bonusAmount) || bonusAmount < 0) {
      throw new ValidationError("Bonus amount must be a non-negative integer (minor units)");
    }
    (updateData as any).bonus_amount = bonusAmount;
  }

  if (status === "bonus_paid") {
    (updateData as any).bonus_paid_at = new Date();
  }

  const updated = await db.update<Referral>("referrals", id, updateData);

  logger.info(`Referral ${id} status updated to ${status}`);

  return updated;
}
