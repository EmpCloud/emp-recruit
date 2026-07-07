// ============================================================================
// CAREERS SERVICE (Public Portal)
//
// Powers the cross-organization public job board and the apply flow:
//   - listPublicJobs / getPublicJob : every org's PUBLISHED, non-internal jobs.
//   - apply                          : create the org-scoped candidate + the
//     application, storing the resume AS A BLOB IN MYSQL (resume_files), and
//     kick off async AI parse+score.
//   - myApplications                 : a logged-in candidate's applications
//     across all organizations.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";
import { ValidationError, NotFoundError } from "../../utils/errors";
import { storeResume } from "./resume-store.service";
import { scoreApplicationInBackground } from "./candidate-ai.service";

const PUBLIC_JOB_COLUMNS = [
  "j.id",
  "j.organization_id",
  "j.title",
  "j.slug",
  "j.department",
  "j.location",
  "j.employment_type",
  "j.experience_min",
  "j.experience_max",
  "j.salary_min",
  "j.salary_max",
  "j.salary_currency",
  "j.description",
  "j.requirements",
  "j.benefits",
  "j.skills",
  "j.published_at",
  "j.closes_at",
];

function parseSkills(row: any): any {
  if (row && typeof row.skills === "string") {
    try {
      row.skills = JSON.parse(row.skills);
    } catch {
      row.skills = [];
    }
  }
  return row;
}

// ---------------------------------------------------------------------------
// Public job board — jobs from ALL organizations that are open to the public.
// A job is public when: status='published', not internal-only, not past close.
// ---------------------------------------------------------------------------
export async function listPublicJobs(params: {
  page?: number;
  perPage?: number;
  search?: string;
  location?: string;
  employmentType?: string;
  organizationId?: number;
}): Promise<{ data: any[]; total: number; page: number; perPage: number }> {
  const knex = getDB().knex();
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(50, Math.max(1, params.perPage || 10));

  const base = () => {
    let q = knex("job_postings as j")
      .where("j.status", "open")
      // Exclude internal-only postings from the public board (migration 010).
      .andWhere(function (this: any) {
        this.where("j.is_internal", 0).orWhereNull("j.is_internal");
      })
      // Not past its closing date.
      .andWhere(function (this: any) {
        this.whereNull("j.closes_at").orWhere("j.closes_at", ">=", knex.fn.now());
      });

    if (params.search) {
      const like = `%${params.search.trim()}%`;
      q = q.andWhere(function (this: any) {
        this.where("j.title", "like", like)
          .orWhere("j.description", "like", like)
          .orWhere("j.department", "like", like);
      });
    }
    if (params.location) q = q.andWhere("j.location", "like", `%${params.location.trim()}%`);
    if (params.employmentType) q = q.andWhere("j.employment_type", params.employmentType);
    if (params.organizationId) q = q.andWhere("j.organization_id", params.organizationId);
    return q;
  };

  const [{ count }] = await base().clone().count("j.id as count");
  const rows = await base()
    .select(PUBLIC_JOB_COLUMNS)
    .orderBy("j.published_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Enrich with org names (EmpCloud master DB) + application counts.
  const enriched = await attachOrgNames(rows.map(parseSkills));
  return { data: enriched, total: Number(count), page, perPage };
}

export async function getPublicJob(idOrSlug: string): Promise<any> {
  const knex = getDB().knex();
  const row = await knex("job_postings as j")
    .where("j.status", "open")
    .andWhere(function (this: any) {
      this.where("j.id", idOrSlug).orWhere("j.slug", idOrSlug);
    })
    .select(PUBLIC_JOB_COLUMNS)
    .first();
  if (!row) throw new NotFoundError("Job");
  const [enriched] = await attachOrgNames([parseSkills(row)]);
  return enriched;
}

// ---------------------------------------------------------------------------
// Apply to a job. Stores resume in MySQL, creates/links candidate + application.
// ---------------------------------------------------------------------------
export async function apply(params: {
  accountId: string;
  jobId: string;
  coverLetter?: string;
  resume?: { buffer: Buffer; fileName: string; mimeType: string } | null;
  useDefaultResume?: boolean;
}): Promise<{ application_id: string; candidate_id: string; resume_file_id: string | null }> {
  const knex = getDB().knex();

  const account = await knex("candidate_accounts").where({ id: params.accountId }).first();
  if (!account) throw new NotFoundError("Account");

  const job = await knex("job_postings").where({ id: params.jobId }).first();
  if (!job || job.status !== "open") throw new NotFoundError("Job");
  const orgId = job.organization_id;

  // Prevent duplicate applications to the same job by the same account.
  const dup = await knex("applications")
    .where({ job_id: params.jobId, account_id: params.accountId })
    .first();
  if (dup) throw new ValidationError("You have already applied to this job");

  // --- Resume: store in MySQL (BLOB), or reuse the account's default. --------
  let resumeFileId: string | null = null;
  if (params.resume?.buffer?.length) {
    resumeFileId = await storeResume({
      accountId: params.accountId,
      organizationId: orgId,
      fileName: params.resume.fileName,
      mimeType: params.resume.mimeType,
      buffer: params.resume.buffer,
    });
  } else if (params.useDefaultResume && account.default_resume_id) {
    resumeFileId = account.default_resume_id;
  } else {
    throw new ValidationError("A resume is required to apply");
  }

  // --- Candidate (org-scoped ATS record), find-or-create by email. -----------
  let candidate = await knex("candidates")
    .where({ organization_id: orgId, email: account.email })
    .first();
  const candidateId = candidate?.id || uuidv4();
  if (!candidate) {
    await knex("candidates").insert({
      id: candidateId,
      organization_id: orgId,
      account_id: params.accountId,
      first_name: account.first_name || "Candidate",
      last_name: account.last_name || "",
      email: account.email,
      phone: account.phone || null,
      source: "portal",
      resume_file_id: resumeFileId,
      linkedin_url: account.linkedin_url || null,
      portfolio_url: account.portfolio_url || null,
      current_company: account.current_company || null,
      current_title: account.current_title || null,
      experience_years: account.experience_years ?? null,
      skills: account.skills || null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  } else {
    await knex("candidates").where({ id: candidateId }).update({
      account_id: params.accountId,
      resume_file_id: resumeFileId,
      updated_at: new Date(),
    });
  }

  // --- Application -----------------------------------------------------------
  const applicationId = uuidv4();
  await knex("applications").insert({
    id: applicationId,
    organization_id: orgId,
    job_id: params.jobId,
    candidate_id: candidateId,
    account_id: params.accountId,
    resume_file_id: resumeFileId,
    stage: "applied",
    source: "portal",
    source_portal: "portal",
    cover_letter: params.coverLetter || null,
    applied_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Fire-and-forget AI parse + score so the recruiter sees a match score.
  scoreApplicationInBackground(applicationId).catch((err) =>
    logger.warn(`AI scoring failed for application ${applicationId}: ${err.message}`),
  );

  return { application_id: applicationId, candidate_id: candidateId, resume_file_id: resumeFileId };
}

// ---------------------------------------------------------------------------
// A candidate's own applications across all organizations.
// ---------------------------------------------------------------------------
export async function myApplications(accountId: string): Promise<any[]> {
  const knex = getDB().knex();
  const rows = await knex("applications as a")
    .join("job_postings as j", "a.job_id", "j.id")
    .where("a.account_id", accountId)
    .select(
      "a.id",
      "a.stage",
      "a.applied_at",
      "a.organization_id",
      "j.id as job_id",
      "j.title as job_title",
      "j.location as job_location",
      "j.employment_type",
    )
    .orderBy("a.applied_at", "desc");
  return attachOrgNames(rows, "organization_id");
}

// ---------------------------------------------------------------------------
// Attach org display names from the EmpCloud master DB (best-effort).
// ---------------------------------------------------------------------------
async function attachOrgNames(rows: any[], orgKey = "organization_id"): Promise<any[]> {
  if (!rows.length) return rows;
  try {
    const { getEmpCloudDB } = await import("../../db/empcloud");
    const empDb = getEmpCloudDB();
    const orgIds = [...new Set(rows.map((r) => r[orgKey]).filter(Boolean))];
    if (!orgIds.length) return rows;
    const orgs = await empDb("organizations").whereIn("id", orgIds).select("id", "name");
    const byId = new Map(orgs.map((o: any) => [Number(o.id), o.name]));
    return rows.map((r) => ({ ...r, organization_name: byId.get(Number(r[orgKey])) || "Company" }));
  } catch (err) {
    // If the EmpCloud DB isn't reachable, degrade gracefully — the board still
    // works, just without company display names.
    logger.warn(`attachOrgNames failed: ${(err as Error).message}`);
    return rows.map((r) => ({ ...r, organization_name: "Company" }));
  }
}
