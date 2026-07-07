// ============================================================================
// ANALYTICS SERVICE
// Recruitment dashboards: overview, pipeline funnel, time-to-hire, sources.
// ============================================================================

import { getDB } from "../../db/adapters";
import type { ApplicationStage } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Dashboard Overview
// ---------------------------------------------------------------------------
export async function getDashboard(orgId: number): Promise<{
  openJobs: number;
  totalCandidates: number;
  activeApplications: number;
  recentHires: number;
}> {
  const db = getDB();

  const openJobs = await db.count("job_postings", { organization_id: orgId, status: "open" });
  const totalCandidates = await db.count("candidates", { organization_id: orgId });

  // Active applications = not rejected, not withdrawn, not hired
  const allApps = await db.count("applications", { organization_id: orgId });
  const rejectedApps = await db.count("applications", { organization_id: orgId, stage: "rejected" });
  const withdrawnApps = await db.count("applications", { organization_id: orgId, stage: "withdrawn" });
  const hiredApps = await db.count("applications", { organization_id: orgId, stage: "hired" });
  const activeApplications = allApps - rejectedApps - withdrawnApps - hiredApps;

  // Recent hires = candidates actually moved to 'hired' in the last 30 days.
  // The real hire moment is the stage-history row (to_stage='hired'), not the
  // application's updated_at (which changes on any later edit).
  const knex = db.knex();
  const recentRow = await knex("application_stage_history as h")
    .join("applications as a", "h.application_id", "a.id")
    .where("a.organization_id", orgId)
    .andWhere("h.to_stage", "hired")
    .andWhere("h.created_at", ">=", knex.raw("DATE_SUB(NOW(), INTERVAL 30 DAY)"))
    .countDistinct("h.application_id as c")
    .first();
  const recentHires = Number((recentRow as any)?.c ?? 0);

  return { openJobs, totalCandidates, activeApplications, recentHires };
}

// ---------------------------------------------------------------------------
// Pipeline Funnel
// ---------------------------------------------------------------------------
const STAGES: ApplicationStage[] = ["applied", "screened", "interview", "offer", "hired", "rejected", "withdrawn"] as ApplicationStage[];

export async function getPipelineFunnel(
  orgId: number,
  jobId?: string,
): Promise<{ stage: string; count: number }[]> {
  const db = getDB();

  const results = await Promise.all(
    STAGES.map(async (stage) => {
      const filters: Record<string, any> = { organization_id: orgId, stage };
      if (jobId) filters.job_id = jobId;
      const count = await db.count("applications", filters);
      return { stage, count };
    }),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Time to Hire
// ---------------------------------------------------------------------------
export async function getTimeToHire(orgId: number): Promise<{
  averageDays: number;
  hiredCount: number;
}> {
  const db = getDB();
  const knex = db.knex();

  // Time-to-hire = days from applied_at to the ACTUAL hire moment. The hire
  // moment is the earliest stage-history row with to_stage='hired' (not the
  // application's updated_at, which changes on any later edit). Fall back to
  // updated_at only if no history row exists (legacy data).
  const rows = await knex("applications as a")
    .leftJoin(
      knex("application_stage_history")
        .select("application_id")
        .min("created_at as hired_at")
        .where("to_stage", "hired")
        .groupBy("application_id")
        .as("h"),
      "h.application_id",
      "a.id",
    )
    .where("a.organization_id", orgId)
    .andWhere("a.stage", "hired")
    .select("a.applied_at", "a.updated_at", "h.hired_at")
    .limit(5000);

  if (rows.length === 0) return { averageDays: 0, hiredCount: 0 };

  let totalDays = 0;
  for (const app of rows as any[]) {
    const appliedDate = new Date(app.applied_at);
    const hiredDate = new Date(app.hired_at || app.updated_at);
    const diffDays = Math.max(1, Math.round((hiredDate.getTime() - appliedDate.getTime()) / 86_400_000));
    totalDays += diffDays;
  }

  const averageDays = Math.round(totalDays / rows.length);
  return { averageDays, hiredCount: rows.length };
}

// ---------------------------------------------------------------------------
// Source Effectiveness
// ---------------------------------------------------------------------------
export async function getSourceEffectiveness(orgId: number): Promise<
  { source: string; total: number; hired: number; hireRate: number }[]
> {
  const db = getDB();

  const sources = ["direct", "referral", "linkedin", "indeed", "naukri", "other"];

  const results = await Promise.all(
    sources.map(async (source) => {
      const total = await db.count("applications", { organization_id: orgId, source });
      const hired = await db.count("applications", { organization_id: orgId, source, stage: "hired" });
      const hireRate = total > 0 ? Math.round((hired / total) * 100) : 0;
      return { source, total, hired, hireRate };
    }),
  );

  // Only return sources that have at least one application
  return results.filter((r) => r.total > 0);
}
