// ============================================================================
// INTERVIEW SERVICE
// Business logic for scheduling interviews, managing panelists, and feedback.
// ============================================================================

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findUserById, findOrgById } from "../../db/empcloud";
import { sendEmail } from "../email/email.service";
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

// ---------------------------------------------------------------------------
// Calendar link helpers
// ---------------------------------------------------------------------------

function formatGCalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function generateCalendarLinks(
  interview: Interview,
  candidateName: string,
  jobTitle: string,
  orgName: string,
): { google: string; outlook: string; office365: string } {
  const title = encodeURIComponent(
    `Interview: ${candidateName} - ${jobTitle} (Round ${interview.round})`,
  );
  const startDate = new Date(interview.scheduled_at);
  const endDate = new Date(startDate.getTime() + (interview.duration_minutes || 60) * 60000);

  const description = encodeURIComponent(
    `Interview for ${jobTitle} position at ${orgName}\n\n` +
      `Candidate: ${candidateName}\n` +
      `Type: ${interview.type}\n` +
      `Round: ${interview.round}\n` +
      (interview.meeting_link ? `\nMeeting Link: ${interview.meeting_link}\n` : "") +
      (interview.notes ? `\nNotes: ${interview.notes}` : ""),
  );

  const location = encodeURIComponent(interview.location || interview.meeting_link || "");

  return {
    google:
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${title}` +
      `&dates=${formatGCalDate(startDate)}/${formatGCalDate(endDate)}` +
      `&details=${description}` +
      `&location=${location}`,
    outlook:
      `https://outlook.live.com/calendar/0/action/compose` +
      `?subject=${title}` +
      `&startdt=${startDate.toISOString()}` +
      `&enddt=${endDate.toISOString()}` +
      `&body=${description}` +
      `&location=${location}`,
    office365:
      `https://outlook.office.com/calendar/0/action/compose` +
      `?subject=${title}` +
      `&startdt=${startDate.toISOString()}` +
      `&enddt=${endDate.toISOString()}` +
      `&body=${description}` +
      `&location=${location}`,
  };
}

function generateICSContent(
  interview: Interview,
  candidateName: string,
  jobTitle: string,
  orgName: string,
): string {
  const startDate = new Date(interview.scheduled_at);
  const endDate = new Date(startDate.getTime() + (interview.duration_minutes || 60) * 60000);

  const formatICS = (d: Date): string =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const description =
    `Interview for ${jobTitle} position at ${orgName}\\n\\n` +
    `Candidate: ${candidateName}\\n` +
    `Type: ${interview.type}\\n` +
    `Round: ${interview.round}\\n` +
    (interview.meeting_link ? `\\nMeeting Link: ${interview.meeting_link}\\n` : "") +
    (interview.notes ? `\\nNotes: ${interview.notes}` : "");

  const location = interview.location || interview.meeting_link || "";
  const url = interview.meeting_link || "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EMP Recruit//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART:${formatICS(startDate)}`,
    `DTEND:${formatICS(endDate)}`,
    `SUMMARY:Interview: ${candidateName} - ${jobTitle} (Round ${interview.round})`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    ...(url ? [`URL:${url}`] : []),
    `UID:${interview.id}@emp-recruit`,
    `DTSTAMP:${formatICS(new Date())}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// Get calendar links for an interview
// ---------------------------------------------------------------------------

export async function getCalendarLinks(
  orgId: number,
  interviewId: string,
): Promise<{ google: string; outlook: string; office365: string }> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Get application -> candidate + job
  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", interview.application_id);

  let candidateName = "Candidate";
  let jobTitle = "Open Position";

  if (appRow) {
    const candidate = await db.findById<{ first_name: string; last_name: string }>(
      "candidates",
      appRow.candidate_id,
    );
    if (candidate) {
      candidateName = `${candidate.first_name} ${candidate.last_name}`;
    }
    const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
    if (job) {
      jobTitle = job.title;
    }
  }

  const org = await findOrgById(orgId);
  const orgName = org?.name || "Our Company";

  return generateCalendarLinks(interview, candidateName, jobTitle, orgName);
}

// ---------------------------------------------------------------------------
// Generate ICS file content for an interview
// ---------------------------------------------------------------------------

export async function generateICSFile(
  orgId: number,
  interviewId: string,
): Promise<string> {
  const db = getDB();

  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", interview.application_id);

  let candidateName = "Candidate";
  let jobTitle = "Open Position";

  if (appRow) {
    const candidate = await db.findById<{ first_name: string; last_name: string }>(
      "candidates",
      appRow.candidate_id,
    );
    if (candidate) {
      candidateName = `${candidate.first_name} ${candidate.last_name}`;
    }
    const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
    if (job) {
      jobTitle = job.title;
    }
  }

  const org = await findOrgById(orgId);
  const orgName = org?.name || "Our Company";

  return generateICSContent(interview, candidateName, jobTitle, orgName);
}

// ---------------------------------------------------------------------------
// Send interview invitation emails to candidate and panelists
// ---------------------------------------------------------------------------

export async function sendInterviewInvitation(
  orgId: number,
  interviewId: string,
): Promise<{ sent_to: string[] }> {
  const db = getDB();

  // Get interview details
  const interview = await db.findOne<Interview>("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  // Get application -> candidate + job
  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", interview.application_id);
  if (!appRow) {
    throw new NotFoundError("Application", interview.application_id);
  }

  const candidate = await db.findById<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  }>("candidates", appRow.candidate_id);
  if (!candidate) {
    throw new NotFoundError("Candidate", appRow.candidate_id);
  }

  const job = await db.findById<{ title: string }>("job_postings", appRow.job_id);
  const jobTitle = job?.title || "Open Position";

  // Get organization name from empcloud
  const org = await findOrgById(orgId);
  const orgName = org?.name || "Our Company";

  // Format schedule
  const scheduledDate = new Date(interview.scheduled_at);
  const dateStr = scheduledDate.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = scheduledDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const meetingLinkHtml = interview.meeting_link
    ? `<p><strong>Meeting Link:</strong> <a href="${interview.meeting_link}">${interview.meeting_link}</a></p>`
    : "";

  const locationHtml = interview.location
    ? `<p><strong>Location:</strong> ${interview.location}</p>`
    : "";

  // Generate calendar links for the email
  const calLinks = generateCalendarLinks(
    interview,
    `${candidate.first_name} ${candidate.last_name}`,
    jobTitle,
    orgName,
  );

  const calendarLinksHtml = `
      <div style="margin: 16px 0;">
        <p style="font-weight: bold; margin-bottom: 8px;">Add to Calendar:</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="${calLinks.google}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; padding: 8px 16px; background: #4285f4; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
            Google Calendar
          </a>
          <a href="${calLinks.outlook}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; padding: 8px 16px; background: #0078d4; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
            Outlook
          </a>
          <a href="${calLinks.office365}" target="_blank" rel="noopener noreferrer"
            style="display: inline-block; padding: 8px 16px; background: #7c3aed; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
            Office 365
          </a>
        </div>
      </div>`;

  // Build candidate email
  const candidateSubject = `Interview Invitation — ${jobTitle} at ${orgName}`;
  const candidateBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Interview Invitation</h2>
      <p>Dear ${candidate.first_name} ${candidate.last_name},</p>
      <p>We are pleased to invite you for an interview for the <strong>${jobTitle}</strong> position at <strong>${orgName}</strong>.</p>
      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${timeStr}</p>
        <p><strong>Duration:</strong> ${interview.duration_minutes} minutes</p>
        <p><strong>Type:</strong> ${interview.type} (Round ${interview.round})</p>
        ${locationHtml}
        ${meetingLinkHtml}
      </div>
      ${calendarLinksHtml}
      <p>Please ensure you join the meeting on time. If you need to reschedule, please contact us as soon as possible.</p>
      <p>Best regards,<br/>${orgName} Recruitment Team</p>
    </div>
  `;

  const sentTo: string[] = [];

  // Send to candidate
  try {
    await sendEmail(candidate.email, candidateSubject, candidateBody);
    sentTo.push(candidate.email);
  } catch (err) {
    logger.error(`Failed to send invitation to candidate ${candidate.email}`, err);
  }

  // Get panelists and send to each
  const panelistResult = await db.findMany<InterviewPanelist>("interview_panelists", {
    filters: { interview_id: interviewId },
    limit: 100,
  });

  for (const panelist of panelistResult.data) {
    try {
      const user = await findUserById(panelist.user_id);
      if (!user) continue;

      const panelistSubject = `Interview Panel — ${jobTitle} with ${candidate.first_name} ${candidate.last_name}`;
      const panelistBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Interview Panel Invitation</h2>
          <p>Dear ${user.first_name},</p>
          <p>You have been assigned as a panelist for an upcoming interview.</p>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p><strong>Candidate:</strong> ${candidate.first_name} ${candidate.last_name}</p>
            <p><strong>Position:</strong> ${jobTitle}</p>
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Time:</strong> ${timeStr}</p>
            <p><strong>Duration:</strong> ${interview.duration_minutes} minutes</p>
            <p><strong>Your Role:</strong> ${panelist.role}</p>
            ${locationHtml}
            ${meetingLinkHtml}
          </div>
          ${calendarLinksHtml}
          <p>Please prepare your questions and join on time. You can submit your feedback through the recruitment portal after the interview.</p>
          <p>Best regards,<br/>${orgName} Recruitment Team</p>
        </div>
      `;

      await sendEmail(user.email, panelistSubject, panelistBody);
      sentTo.push(user.email);
    } catch (err) {
      logger.error(`Failed to send invitation to panelist ${panelist.user_id}`, err);
    }
  }

  logger.info(`Interview invitation sent for ${interviewId} to ${sentTo.length} recipients`);

  return { sent_to: sentTo };
}
