// ============================================================================
// INTERVIEW SERVICE
// Business logic for scheduling interviews, managing panelists, and feedback.
// Calendar/ICS logic lives in ./calendar.service.ts
// Email invitation logic lives in ./invitation.service.ts
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  Interview,
  InterviewPanelist,
  InterviewFeedback,
  InterviewStatus,
  InterviewType,
  Recommendation,
} from "@emp-recruit/shared";

// Re-export calendar and invitation functions so existing `import *` still works
export { getCalendarLinks, generateICSFile } from "./calendar.service";
export { sendInterviewInvitation } from "./invitation.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleInterviewInput {
  application_id: string;
  type: InterviewType;
  round: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location?: string;
  meeting_link?: string;
  notes?: string;
  created_by: number;
  panelists?: { user_id: number; role: string }[];
}

export interface UpdateInterviewInput {
  type?: InterviewType;
  round?: number;
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
  location?: string;
  meeting_link?: string;
  notes?: string;
}

export interface ListInterviewsParams {
  page?: number;
  limit?: number;
  application_id?: string;
  status?: InterviewStatus;
  sort_field?: string;
  sort_order?: "asc" | "desc";
}

export interface SubmitFeedbackInput {
  recommendation: Recommendation;
  technical_score?: number;
  communication_score?: number;
  cultural_fit_score?: number;
  overall_score?: number;
  strengths?: string;
  weaknesses?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Schedule a new interview with optional panelists
// ---------------------------------------------------------------------------

export async function scheduleInterview(
  orgId: number,
  data: ScheduleInterviewInput,
): Promise<Interview & { panelists: InterviewPanelist[] }> {
  const db = getDB();

  // Verify the application belongs to this org
  const app = await db.findOne<{ id: string }>("applications", {
    id: data.application_id,
    organization_id: orgId,
  });
  if (!app) {
    throw new NotFoundError("Application", data.application_id);
  }

  const interviewId = uuidv4();
  const now = new Date();

  const interview = await db.create<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
    application_id: data.application_id,
    type: data.type,
    round: data.round,
    title: data.title,
    scheduled_at: new Date(data.scheduled_at),
    duration_minutes: data.duration_minutes,
    location: data.location || null,
    meeting_link: data.meeting_link || null,
    status: "scheduled" as InterviewStatus,
    notes: data.notes || null,
    created_by: data.created_by,
    created_at: now,
    updated_at: now,
  });

  // Create panelists
  const panelists: InterviewPanelist[] = [];
  if (data.panelists && data.panelists.length > 0) {
    for (const p of data.panelists) {
      const panelist = await db.create<InterviewPanelist>("interview_panelists", {
        id: uuidv4(),
        interview_id: interviewId,
        user_id: p.user_id,
        role: p.role,
        created_at: now,
      });
      panelists.push(panelist);
    }
  }

  return { ...interview, panelists };
}

// ---------------------------------------------------------------------------
// Update / reschedule an interview
// ---------------------------------------------------------------------------

export async function updateInterview(
  orgId: number,
  id: string,
  data: UpdateInterviewInput,
): Promise<Interview> {
  const db = getDB();

  const existing = await db.findOne<Interview>("interviews", {
    id,
    organization_id: orgId,
  });
  if (!existing) {
    throw new NotFoundError("Interview", id);
  }

  // Convert scheduled_at to Date if present
  const updateData: Record<string, any> = { ...data };
  if (updateData.scheduled_at) {
    updateData.scheduled_at = new Date(updateData.scheduled_at);
  }
  const updated = await db.update<Interview>("interviews", id, updateData);

  return updated;
}

// ---------------------------------------------------------------------------
// List interviews with pagination and filters
// ---------------------------------------------------------------------------

export async function listInterviews(
  orgId: number,
  params: ListInterviewsParams,
): Promise<{
  data: (Interview & { candidate_name: string; job_title: string; panelist_count: number })[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  const db = getDB();
  const page = params.page || 1;
  const limit = params.limit || 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.application_id) filters.application_id = params.application_id;
  if (params.status) filters.status = params.status;

  const result = await db.findMany<Interview>("interviews", {
    page,
    limit,
    filters,
    sort: {
      field: params.sort_field || "scheduled_at",
      order: params.sort_order || "desc",
    },
  });

  // Enrich with candidate name, job title, and panelist count
  const enriched = await Promise.all(
    result.data.map(async (interview) => {
      // Get application -> candidate + job
      const appRow = await db.findById<{
        id: string;
        candidate_id: string;
        job_id: string;
      }>("applications", interview.application_id);

      let candidate_name = "Unknown";
      let job_title = "Unknown";

      if (appRow) {
        const candidate = await db.findById<{ first_name: string; last_name: string }>(
          "candidates",
          appRow.candidate_id,
        );
        if (candidate) {
          candidate_name = `${candidate.first_name} ${candidate.last_name}`;
        }
        const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
        if (job) {
          job_title = job.title;
        }
      }

      const panelist_count = await db.count("interview_panelists", {
        interview_id: interview.id,
      });

      return { ...interview, candidate_name, job_title, panelist_count };
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

// ---------------------------------------------------------------------------
// Get interview detail with panelists and feedback
// ---------------------------------------------------------------------------

export async function getInterview(
  orgId: number,
  id: string,
): Promise<
  Interview & {
    panelists: InterviewPanelist[];
    feedback: InterviewFeedback[];
    candidate_name: string;
    job_title: string;
    application: { id: string; candidate_id: string; job_id: string } | null;
  }
> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", id);
  }

  const panelistResult = await db.findMany<InterviewPanelist>("interview_panelists", {
    filters: { interview_id: id },
    limit: 100,
  });

  const feedbackResult = await db.findMany<InterviewFeedback>("interview_feedback", {
    filters: { interview_id: id },
    limit: 100,
  });

  // Get application -> candidate + job
  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", interview.application_id);

  let candidate_name = "Unknown";
  let job_title = "Unknown";

  if (appRow) {
    const candidate = await db.findById<{ first_name: string; last_name: string }>(
      "candidates",
      appRow.candidate_id,
    );
    if (candidate) {
      candidate_name = `${candidate.first_name} ${candidate.last_name}`;
    }
    const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
    if (job) {
      job_title = job.title;
    }
  }

  return {
    ...interview,
    panelists: panelistResult.data,
    feedback: feedbackResult.data,
    candidate_name,
    job_title,
    application: appRow || null,
  };
}

// ---------------------------------------------------------------------------
// Change interview status
// ---------------------------------------------------------------------------

export async function changeStatus(
  orgId: number,
  id: string,
  status: InterviewStatus,
): Promise<Interview> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", id);
  }

  const updated = await db.update<Interview>("interviews", id, {
    status,
    updated_at: new Date(),
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Add panelist to interview
// ---------------------------------------------------------------------------

export async function addPanelist(
  orgId: number,
  interviewId: string,
  userId: number,
  role: string,
): Promise<InterviewPanelist> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Check if already a panelist
  const existing = await db.findOne<InterviewPanelist>("interview_panelists", {
    interview_id: interviewId,
    user_id: userId,
  });
  if (existing) {
    throw new ValidationError("User is already a panelist for this interview");
  }

  const panelist = await db.create<InterviewPanelist>("interview_panelists", {
    id: uuidv4(),
    interview_id: interviewId,
    user_id: userId,
    role,
    created_at: new Date(),
  });

  return panelist;
}

// ---------------------------------------------------------------------------
// Remove panelist from interview
// ---------------------------------------------------------------------------

export async function removePanelist(
  orgId: number,
  interviewId: string,
  userId: number,
): Promise<void> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const deleted = await db.deleteMany("interview_panelists", {
    interview_id: interviewId,
    user_id: userId,
  });
  if (deleted === 0) {
    throw new NotFoundError("Panelist");
  }
}

// ---------------------------------------------------------------------------
// Submit feedback for an interview
// ---------------------------------------------------------------------------

export async function submitFeedback(
  orgId: number,
  interviewId: string,
  userId: number,
  data: SubmitFeedbackInput,
): Promise<InterviewFeedback> {
  const db = getDB();

  // Verify interview belongs to org
  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Verify user is a panelist
  const panelist = await db.findOne<InterviewPanelist>("interview_panelists", {
    interview_id: interviewId,
    user_id: userId,
  });
  if (!panelist) {
    throw new ForbiddenError("Only panelists can submit feedback for this interview");
  }

  // Check if feedback already submitted
  const existingFeedback = await db.findOne<InterviewFeedback>("interview_feedback", {
    interview_id: interviewId,
    panelist_id: userId,
  });
  if (existingFeedback) {
    throw new ValidationError("Feedback has already been submitted for this interview");
  }

  const now = new Date();
  const feedback = await db.create<InterviewFeedback>("interview_feedback", {
    id: uuidv4(),
    interview_id: interviewId,
    panelist_id: userId,
    recommendation: data.recommendation,
    technical_score: data.technical_score ?? null,
    communication_score: data.communication_score ?? null,
    cultural_fit_score: data.cultural_fit_score ?? null,
    overall_score: data.overall_score ?? null,
    strengths: data.strengths || null,
    weaknesses: data.weaknesses || null,
    notes: data.notes || null,
    submitted_at: now,
    created_at: now,
  });

  return feedback;
}

// ---------------------------------------------------------------------------
// Get all feedback for an interview
// ---------------------------------------------------------------------------

export async function getFeedback(
  orgId: number,
  interviewId: string,
): Promise<InterviewFeedback[]> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const result = await db.findMany<InterviewFeedback>("interview_feedback", {
    filters: { interview_id: interviewId },
    limit: 100,
  });

  return result.data;
}

// ---------------------------------------------------------------------------
// Get aggregated feedback across all interviews for an application
// ---------------------------------------------------------------------------

export async function getAggregatedFeedback(
  orgId: number,
  applicationId: string,
): Promise<{
  total_interviews: number;
  total_feedback: number;
  average_overall_score: number | null;
  average_technical_score: number | null;
  average_communication_score: number | null;
  average_cultural_fit_score: number | null;
  recommendation_summary: Record<string, number>;
  feedback_by_interview: {
    interview_id: string;
    interview_title: string;
    round: number;
    feedback: InterviewFeedback[];
  }[];
}> {
  const db = getDB();

  // Get all interviews for the application in this org
  const interviewResult = await db.findMany<Interview>("interviews", {
    filters: { organization_id: orgId, application_id: applicationId },
    limit: 100,
    sort: { field: "round", order: "asc" },
  });

  const interviews = interviewResult.data;

  let totalFeedback = 0;
  let overallScores: number[] = [];
  let technicalScores: number[] = [];
  let communicationScores: number[] = [];
  let culturalFitScores: number[] = [];
  const recommendationSummary: Record<string, number> = {};
  const feedbackByInterview: {
    interview_id: string;
    interview_title: string;
    round: number;
    feedback: InterviewFeedback[];
  }[] = [];

  for (const interview of interviews) {
    const fbResult = await db.findMany<InterviewFeedback>("interview_feedback", {
      filters: { interview_id: interview.id },
      limit: 100,
    });

    const feedbacks = fbResult.data;
    totalFeedback += feedbacks.length;

    feedbackByInterview.push({
      interview_id: interview.id,
      interview_title: interview.title,
      round: interview.round,
      feedback: feedbacks,
    });

    for (const fb of feedbacks) {
      if (fb.overall_score !== null) overallScores.push(fb.overall_score);
      if (fb.technical_score !== null) technicalScores.push(fb.technical_score);
      if (fb.communication_score !== null) communicationScores.push(fb.communication_score);
      if (fb.cultural_fit_score !== null) culturalFitScores.push(fb.cultural_fit_score);
      recommendationSummary[fb.recommendation] =
        (recommendationSummary[fb.recommendation] || 0) + 1;
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

  return {
    total_interviews: interviews.length,
    total_feedback: totalFeedback,
    average_overall_score: avg(overallScores),
    average_technical_score: avg(technicalScores),
    average_communication_score: avg(communicationScores),
    average_cultural_fit_score: avg(culturalFitScores),
    recommendation_summary: recommendationSummary,
    feedback_by_interview: feedbackByInterview,
  };
}

// ---------------------------------------------------------------------------
// Generate a meeting link (Jitsi Meet — free, no API key required)
// ---------------------------------------------------------------------------

export async function generateMeetingLink(
  orgId: number,
  interviewId: string,
  provider: "jitsi" | "google" = "jitsi",
): Promise<string> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Jitsi Meet links work immediately — no login required, free, open-source.
  // Google Meet would require OAuth2 with Google Calendar API — future TODO.
  const shortId = interviewId.split("-")[0];
  const meetingLink =
    provider === "google"
      ? `https://meet.jit.si/emp-recruit-${shortId}` // Jitsi fallback until Google OAuth is set up
      : `https://meet.jit.si/emp-recruit-${shortId}`;

  await db.update<Interview>("interviews", interviewId, {
    meeting_link: meetingLink,
    updated_at: new Date(),
  });

  logger.info(`Meeting link generated for interview ${interviewId}: ${meetingLink}`);

  return meetingLink;
}

