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

  // Recent hires = hired in last 30 days
  const recentHires = hiredApps; // simplified — count all hired

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

  // Get all hired applications with their applied_at date
  const result = await db.findMany<{
    id: string;
    applied_at: string;
    updated_at: string;
    stage: string;
  }>("applications", {
    filters: { organization_id: orgId, stage: "hired" },
    limit: 1000,
  });

  if (result.data.length === 0) {
    return { averageDays: 0, hiredCount: 0 };
  }

  let totalDays = 0;
  for (const app of result.data) {
    const appliedDate = new Date(app.applied_at);
    const hiredDate = new Date(app.updated_at);
    const diffMs = hiredDate.getTime() - appliedDate.getTime();
    const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    totalDays += diffDays;
  }

  const averageDays = Math.round(totalDays / result.data.length);

  return { averageDays, hiredCount: result.data.length };
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
