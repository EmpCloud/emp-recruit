// ============================================================================
// JOB DISTRIBUTION SERVICE
//
// Publishes a job to external portals and tracks each distribution.
//   - listPortals            : available portals + their mode for the org.
//   - publish                : prepare (assisted) or post (api) a job to a portal.
//   - listForJob             : distribution status per portal for a job.
//   - markPosted             : recruiter confirms an assisted post went live.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { IDistributionProvider, PortalKey, JobToPublish } from "./provider.interface";
import { NaukriProvider } from "./naukri.provider";
import { LinkedInProvider, IndeedProvider, ApnaProvider } from "./api-portals.provider";

const PROVIDERS: Record<PortalKey, IDistributionProvider> = {
  naukri: new NaukriProvider(),
  linkedin: new LinkedInProvider(),
  indeed: new IndeedProvider(),
  apna: new ApnaProvider(),
};

function providerFor(portal: string): IDistributionProvider {
  const p = PROVIDERS[portal as PortalKey];
  if (!p) throw new ValidationError(`Unknown portal: ${portal}`);
  return p;
}

async function orgCreds(orgId: number, portal: string): Promise<Record<string, any> | null> {
  const knex = getDB().knex();
  const row = await knex("portal_credentials")
    .where({ organization_id: orgId, portal, status: "connected" })
    .first();
  if (!row?.credentials) return null;
  try {
    return typeof row.credentials === "string" ? JSON.parse(row.credentials) : row.credentials;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
export async function listPortals(orgId: number): Promise<
  { portal: PortalKey; displayName: string; mode: string; connected: boolean }[]
> {
  const out: { portal: PortalKey; displayName: string; mode: string; connected: boolean }[] = [];
  for (const key of Object.keys(PROVIDERS) as PortalKey[]) {
    const p = PROVIDERS[key];
    const creds = await orgCreds(orgId, key);
    out.push({ portal: key, displayName: p.displayName, mode: p.mode(creds), connected: !!creds });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Credential management (Settings → Job Portals). Credentials are stored per
// org in portal_credentials.credentials (JSON). We never return the raw secret
// values to the client — only a masked summary of which keys are set.
// ---------------------------------------------------------------------------
const KNOWN_PORTALS = new Set<string>(["linkedin", "indeed", "apna", "naukri"]);

export async function getCredentialsStatus(
  orgId: number,
  portal: string,
): Promise<{ portal: string; connected: boolean; fields: string[] }> {
  if (!KNOWN_PORTALS.has(portal)) throw new ValidationError(`Unknown portal: ${portal}`);
  const creds = await orgCreds(orgId, portal);
  return { portal, connected: !!creds, fields: creds ? Object.keys(creds) : [] };
}

export async function saveCredentials(
  orgId: number,
  portal: string,
  credentials: Record<string, any>,
): Promise<{ portal: string; connected: boolean }> {
  if (!KNOWN_PORTALS.has(portal)) throw new ValidationError(`Unknown portal: ${portal}`);
  if (!credentials || typeof credentials !== "object" || Object.keys(credentials).length === 0) {
    throw new ValidationError("Provide at least one credential field.");
  }
  const knex = getDB().knex();
  const existing = await knex("portal_credentials").where({ organization_id: orgId, portal }).first();
  const payload = {
    organization_id: orgId,
    portal,
    credentials: JSON.stringify(credentials),
    status: "connected",
    updated_at: new Date(),
  };
  if (existing) {
    await knex("portal_credentials").where({ id: existing.id }).update(payload);
  } else {
    await knex("portal_credentials").insert({ id: uuidv4(), created_at: new Date(), ...payload });
  }
  logger.info(`Portal credentials saved for org ${orgId}, portal ${portal}`);
  return { portal, connected: true };
}

export async function deleteCredentials(orgId: number, portal: string): Promise<void> {
  if (!KNOWN_PORTALS.has(portal)) throw new ValidationError(`Unknown portal: ${portal}`);
  const knex = getDB().knex();
  await knex("portal_credentials").where({ organization_id: orgId, portal }).del();
  logger.info(`Portal credentials removed for org ${orgId}, portal ${portal}`);
}

// ---------------------------------------------------------------------------
async function loadJob(orgId: number, jobId: string): Promise<JobToPublish> {
  const knex = getDB().knex();
  const j = await knex("job_postings").where({ id: jobId, organization_id: orgId }).first();
  if (!j) throw new NotFoundError("Job");
  let skills: string[] = [];
  try { skills = typeof j.skills === "string" ? JSON.parse(j.skills) : j.skills || []; } catch { /* */ }

  // Public apply link back into our own candidate portal.
  const appBase = process.env.PUBLIC_APP_URL || config.cors.origin || "http://localhost:5179";
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    requirements: j.requirements,
    location: j.location,
    employmentType: j.employment_type,
    experienceMin: j.experience_min,
    experienceMax: j.experience_max,
    salaryMin: j.salary_min,
    salaryMax: j.salary_max,
    salaryCurrency: j.salary_currency,
    skills,
    applyUrl: `${appBase}/jobs-portal/jobs/${j.slug || j.id}`,
  };
}

// ---------------------------------------------------------------------------
export async function publish(
  orgId: number,
  jobId: string,
  portal: string,
  userId?: number,
): Promise<any> {
  const knex = getDB().knex();
  const provider = providerFor(portal);
  const job = await loadJob(orgId, jobId);
  const creds = await orgCreds(orgId, portal);

  const result = await provider.publish(job, creds);

  // Upsert the distribution record.
  const existing = await knex("job_distributions").where({ job_id: jobId, portal }).first();
  const status =
    result.mode === "api" ? "posted" : result.mode === "assisted" ? "prepared" : "failed";
  const row = {
    organization_id: orgId,
    job_id: jobId,
    portal,
    status,
    external_id: result.externalId || null,
    external_url: result.externalUrl || null,
    payload: JSON.stringify(result.payload || { prefillUrl: result.prefillUrl, reason: result.reason }),
    error: result.mode === "unavailable" ? result.reason || null : null,
    created_by: userId ?? null,
    posted_at: result.mode === "api" ? new Date() : null,
    updated_at: new Date(),
  };
  if (existing) {
    await knex("job_distributions").where({ id: existing.id }).update(row);
  } else {
    await knex("job_distributions").insert({ id: uuidv4(), created_at: new Date(), ...row });
  }

  logger.info(`Job ${jobId} → ${portal}: ${result.mode} (${status})`);
  return { portal, ...result, status };
}

// ---------------------------------------------------------------------------
export async function listForJob(orgId: number, jobId: string): Promise<any[]> {
  const knex = getDB().knex();
  return knex("job_distributions")
    .where({ organization_id: orgId, job_id: jobId })
    .select("portal", "status", "external_url", "posted_at", "error", "updated_at")
    .orderBy("updated_at", "desc");
}

// Recruiter confirms an assisted post went live (optionally with the URL).
export async function markPosted(orgId: number, jobId: string, portal: string, externalUrl?: string): Promise<void> {
  const knex = getDB().knex();
  const n = await knex("job_distributions")
    .where({ organization_id: orgId, job_id: jobId, portal })
    .update({ status: "posted", external_url: externalUrl || null, posted_at: new Date(), updated_at: new Date() });
  if (!n) throw new NotFoundError("Distribution");
}
