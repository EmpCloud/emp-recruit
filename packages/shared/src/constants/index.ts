// ============================================================================
// EMP-RECRUIT CONSTANTS
// ============================================================================

import { ApplicationStage, InterviewType } from "../types";

// ---------------------------------------------------------------------------
// Pipeline Stages
// ---------------------------------------------------------------------------

export const PIPELINE_STAGES = [
  { key: ApplicationStage.APPLIED, label: "Applied", color: "#6B7280" },
  { key: ApplicationStage.SCREENED, label: "Screened", color: "#3B82F6" },
  { key: ApplicationStage.INTERVIEW, label: "Interview", color: "#8B5CF6" },
  { key: ApplicationStage.OFFER, label: "Offer", color: "#F59E0B" },
  { key: ApplicationStage.HIRED, label: "Hired", color: "#10B981" },
  { key: ApplicationStage.REJECTED, label: "Rejected", color: "#EF4444" },
  { key: ApplicationStage.WITHDRAWN, label: "Withdrawn", color: "#9CA3AF" },
] as const;

// ---------------------------------------------------------------------------
// Default Email Template Triggers
// ---------------------------------------------------------------------------

export const EMAIL_TEMPLATE_TRIGGERS = [
  { key: "application_received", label: "Application Received" },
  { key: "application_rejected", label: "Application Rejected" },
  { key: "interview_scheduled", label: "Interview Scheduled" },
  { key: "interview_reminder", label: "Interview Reminder" },
  { key: "interview_cancelled", label: "Interview Cancelled" },
  { key: "offer_sent", label: "Offer Letter Sent" },
  { key: "offer_accepted", label: "Offer Accepted" },
  { key: "offer_declined", label: "Offer Declined" },
  { key: "onboarding_started", label: "Onboarding Started" },
  { key: "referral_submitted", label: "Referral Submitted" },
  { key: "referral_bonus_eligible", label: "Referral Bonus Eligible" },
] as const;

// ---------------------------------------------------------------------------
// Interview Round Defaults
// ---------------------------------------------------------------------------

export const INTERVIEW_ROUND_DEFAULTS: Record<
  number,
  { type: InterviewType; title: string; duration: number }
> = {
  1: { type: InterviewType.PHONE, title: "Phone Screen", duration: 30 },
  2: { type: InterviewType.VIDEO, title: "Technical Interview", duration: 60 },
  3: { type: InterviewType.ONSITE, title: "Onsite / Culture Fit", duration: 90 },
  4: { type: InterviewType.PANEL, title: "Panel Interview", duration: 60 },
};

// ---------------------------------------------------------------------------
// Onboarding Task Categories
// ---------------------------------------------------------------------------

export const ONBOARDING_CATEGORIES = [
  "documentation",
  "it_setup",
  "hr_formalities",
  "team_introduction",
  "training",
  "compliance",
] as const;

// ---------------------------------------------------------------------------
// Application rating scale
// ---------------------------------------------------------------------------

export const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Below Average",
  3: "Average",
  4: "Good",
  5: "Excellent",
};
