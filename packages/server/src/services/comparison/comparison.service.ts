// ============================================================================
// CANDIDATE COMPARISON SERVICE
// Side-by-side comparison of multiple candidates for a job.
// ============================================================================

import { getDB } from "../../db/adapters";
import { ValidationError, NotFoundError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonCandidate {
  application_id: string;
  candidate_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  current_company: string | null;
  current_title: string | null;
  experience_years: number | null;
  skills: string[] | null;
  stage: string;
  rating: number | null;
  applied_at: string;
  job_title: string;
  // AI score data
  overall_score: number | null;
  skills_score: number | null;
  experience_score: number | null;
  recommendation: string | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  // Interview feedback
  interviews: InterviewSummary[];
}

interface InterviewSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  overall_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  cultural_fit_score: number | null;
  recommendation: string | null;
  strengths: string | null;
  weaknesses: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function compareCandidates(
  orgId: number,
  applicationIds: string[],
): Promise<ComparisonCandidate[]> {
  if (!applicationIds || applicationIds.length < 2) {
    throw new ValidationError("At least 2 application IDs are required for comparison");
  }
  if (applicationIds.length > 5) {
    throw new ValidationError("Maximum 5 candidates can be compared at once");
  }

  const db = getDB();
  const results: ComparisonCandidate[] = [];

  for (const appId of applicationIds) {
    // Fetch application with candidate and job info
    const rows = await db.raw<any[][]>(
      `SELECT a.*, c.first_name, c.last_name, c.email, c.phone,
              c.current_company, c.current_title, c.experience_years,
              c.skills as candidate_skills, j.title as job_title
       FROM applications a
       LEFT JOIN candidates c ON c.id = a.candidate_id
       LEFT JOIN job_postings j ON j.id = a.job_id
       WHERE a.id = ? AND a.organization_id = ?`,
      [appId, orgId],
    );

    const app = rows[0]?.[0];
    if (!app) {
      throw new NotFoundError("Application", appId);
    }

    // Fetch AI score if available
    const scoreRows = await db.raw<any[][]>(
      `SELECT overall_score, skills_score, experience_score, recommendation,
              matched_skills, missing_skills
       FROM candidate_scores
       WHERE application_id = ? AND organization_id = ?
       ORDER BY scored_at DESC LIMIT 1`,
      [appId, orgId],
    );
    const score = scoreRows[0]?.[0];

    // Fetch interview feedback
    const interviewRows = await db.raw<any[][]>(
      `SELECT i.id, i.title, i.type, i.status,
              f.overall_score, f.technical_score, f.communication_score,
              f.cultural_fit_score, f.recommendation, f.strengths, f.weaknesses
       FROM interviews i
       LEFT JOIN interview_feedback f ON f.interview_id = i.id
       WHERE i.application_id = ? AND i.organization_id = ?
       ORDER BY i.round ASC`,
      [appId, orgId],
    );
    const interviews: InterviewSummary[] = (interviewRows[0] || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      overall_score: row.overall_score,
      technical_score: row.technical_score,
      communication_score: row.communication_score,
      cultural_fit_score: row.cultural_fit_score,
      recommendation: row.recommendation,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
    }));

    // Parse JSON fields safely
    const parseJson = (val: any): string[] | null => {
      if (!val) return null;
      try {
        return typeof val === "string" ? JSON.parse(val) : val;
      } catch {
        return null;
      }
    };

    results.push({
      application_id: appId,
      candidate_id: app.candidate_id,
      first_name: app.first_name,
      last_name: app.last_name,
      email: app.email,
      phone: app.phone,
      current_company: app.current_company,
      current_title: app.current_title,
      experience_years: app.experience_years,
      skills: parseJson(app.candidate_skills),
      stage: app.stage,
      rating: app.rating,
      applied_at: app.applied_at,
      job_title: app.job_title,
      overall_score: score?.overall_score ?? null,
      skills_score: score?.skills_score ?? null,
      experience_score: score?.experience_score ?? null,
      recommendation: score?.recommendation ?? null,
      matched_skills: parseJson(score?.matched_skills),
      missing_skills: parseJson(score?.missing_skills),
      interviews,
    });
  }

  return results;
}
