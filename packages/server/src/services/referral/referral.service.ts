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
  referrerId?: number; // for employee: show only own referrals
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

export async function listReferrals(
  orgId: number,
  params: ListParams,
): Promise<{
  data: (Referral & { candidate_name: string; job_title: string })[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;
  if (params.referrerId) filters.referrer_id = params.referrerId;

  const result = await db.findMany<Referral>("referrals", {
    page: params.page || 1,
    limit: params.limit || 20,
    filters,
    sort: { field: "created_at", order: "desc" },
  });

  // Enrich with candidate name and job title
  const enriched = await Promise.all(
    result.data.map(async (ref) => {
      const candidate = await db.findById<Candidate>("candidates", ref.candidate_id);
      const job = await db.findById<JobPosting>("job_postings", ref.job_id);
      return {
        ...ref,
        candidate_name: candidate ? `${candidate.first_name} ${candidate.last_name}` : "Unknown",
        job_title: job?.title || "Unknown",
      };
    }),
  );

  return {
    data: enriched,
    total: result.total,
    page: result.page,
    perPage: result.limit,
    totalPages: result.totalPages,
  };
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

  const updateData: Partial<Referral> = { status } as Partial<Referral>;

  if (bonusAmount !== undefined) {
    (updateData as any).bonus_amount = bonusAmount;
  }

  if (status === "bonus_paid") {
    (updateData as any).bonus_paid_at = new Date();
  }

  const updated = await db.update<Referral>("referrals", id, updateData);

  logger.info(`Referral ${id} status updated to ${status}`);

  return updated;
}
