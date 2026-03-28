// ============================================================================
// INTERVIEW CALENDAR SERVICE
// Calendar link generation (Google, Outlook, Office 365) and ICS file export.
// ============================================================================

import { getDB } from "../../db/adapters";
import { findOrgById } from "../../db/empcloud";
import { NotFoundError } from "../../utils/errors";
import type { Interview } from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatGCalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function generateCalendarLinks(
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

export function generateICSContent(
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
// Resolve candidate name and job title from an interview's application
// ---------------------------------------------------------------------------

export async function resolveInterviewContext(
  applicationId: string,
): Promise<{ candidateName: string; jobTitle: string }> {
  const db = getDB();

  const appRow = await db.findById<{
    id: string;
    candidate_id: string;
    job_id: string;
  }>("applications", applicationId);

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

  return { candidateName, jobTitle };
}

// ---------------------------------------------------------------------------
// Public API: get calendar links for an interview
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

  const { candidateName, jobTitle } = await resolveInterviewContext(interview.application_id);

  const org = await findOrgById(orgId);
  const orgName = org?.name || "Our Company";

  return generateCalendarLinks(interview, candidateName, jobTitle, orgName);
}

// ---------------------------------------------------------------------------
// Public API: generate ICS file content for an interview
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

  const { candidateName, jobTitle } = await resolveInterviewContext(interview.application_id);

  const org = await findOrgById(orgId);
  const orgName = org?.name || "Our Company";

  return generateICSContent(interview, candidateName, jobTitle, orgName);
}
