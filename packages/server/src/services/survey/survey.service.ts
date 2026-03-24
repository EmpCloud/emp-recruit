// ============================================================================
// CANDIDATE EXPERIENCE SURVEY / NPS SERVICE
// Manages candidate surveys, anonymous response submission, and NPS calculation.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  CandidateSurvey,
  CandidateSurveyResponse,
  SurveyType,
} from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Standard survey questions by type
// ---------------------------------------------------------------------------

const SURVEY_QUESTIONS: Record<string, Array<{ key: string; label: string; type: "rating" | "text" }>> = {
  post_interview: [
    { key: "overall_experience", label: "How would you rate your overall interview experience?", type: "rating" },
    { key: "communication", label: "How well did we communicate throughout the process?", type: "rating" },
    { key: "interviewer_professionalism", label: "How professional were the interviewers?", type: "rating" },
    { key: "process_clarity", label: "How clear was the interview process?", type: "rating" },
    { key: "timeliness", label: "How timely was the scheduling and feedback?", type: "rating" },
    { key: "recommend_likelihood", label: "How likely are you to recommend us as an employer? (1-10)", type: "rating" },
    { key: "feedback_text", label: "Any additional feedback or suggestions?", type: "text" },
  ],
  post_offer: [
    { key: "overall_experience", label: "How would you rate the overall hiring experience?", type: "rating" },
    { key: "offer_clarity", label: "How clear and transparent was the offer?", type: "rating" },
    { key: "responsiveness", label: "How responsive was the team to your questions?", type: "rating" },
    { key: "process_speed", label: "How satisfied are you with the speed of the process?", type: "rating" },
    { key: "recommend_likelihood", label: "How likely are you to recommend us as an employer? (1-10)", type: "rating" },
    { key: "feedback_text", label: "What could we improve?", type: "text" },
  ],
  post_rejection: [
    { key: "overall_experience", label: "How would you rate your overall experience with us?", type: "rating" },
    { key: "communication", label: "How well did we communicate throughout the process?", type: "rating" },
    { key: "feedback_quality", label: "How useful was the feedback provided?", type: "rating" },
    { key: "respectfulness", label: "How respectfully were you treated?", type: "rating" },
    { key: "recommend_likelihood", label: "How likely are you to recommend us as an employer? (1-10)", type: "rating" },
    { key: "would_reapply", label: "Would you consider applying again in the future?", type: "rating" },
    { key: "feedback_text", label: "How can we improve our hiring process?", type: "text" },
  ],
};

// ---------------------------------------------------------------------------
// Send Survey
// ---------------------------------------------------------------------------

export async function sendSurvey(
  orgId: number,
  data: {
    candidate_id: string;
    application_id: string;
    survey_type: SurveyType;
  },
): Promise<CandidateSurvey & { questions: typeof SURVEY_QUESTIONS[string] }> {
  const db = getDB();

  // Verify candidate and application exist
  const candidate = await db.findOne<any>("candidates", {
    id: data.candidate_id,
    organization_id: orgId,
  });
  if (!candidate) throw new NotFoundError("Candidate", data.candidate_id);

  const application = await db.findOne<any>("applications", {
    id: data.application_id,
    organization_id: orgId,
  });
  if (!application) throw new NotFoundError("Application", data.application_id);

  // Check if survey already sent for this application and type
  const existing = await db.findOne<CandidateSurvey>("candidate_surveys", {
    application_id: data.application_id,
    survey_type: data.survey_type,
    organization_id: orgId,
  });
  if (existing) {
    throw new ValidationError("A survey of this type has already been sent for this application");
  }

  const id = uuidv4();
  const token = crypto.randomBytes(48).toString("hex"); // 96 char token

  const record = await db.create<CandidateSurvey>("candidate_surveys", {
    id,
    organization_id: orgId,
    candidate_id: data.candidate_id,
    application_id: data.application_id,
    survey_type: data.survey_type,
    status: "sent",
    sent_at: new Date(),
    completed_at: null,
    token,
  } as any);

  const questions = SURVEY_QUESTIONS[data.survey_type] || SURVEY_QUESTIONS.post_interview;

  logger.info(
    `Survey sent: ${id} (${data.survey_type}) for candidate ${data.candidate_id}, token: ${token.slice(0, 8)}...`,
  );

  return { ...record, questions };
}

// ---------------------------------------------------------------------------
// Submit Response (PUBLIC — via token, no auth)
// ---------------------------------------------------------------------------

export async function submitResponse(
  token: string,
  responses: Array<{ question_key: string; rating?: number; text_response?: string }>,
): Promise<{ success: boolean; message: string }> {
  const db = getDB();

  // Find survey by token
  const survey = await db.findOne<CandidateSurvey>("candidate_surveys", { token });
  if (!survey) throw new NotFoundError("Survey");

  if (survey.status === "completed") {
    throw new ValidationError("This survey has already been completed");
  }

  if (survey.status === "expired") {
    throw new ValidationError("This survey has expired");
  }

  // Validate responses against known question keys
  const validKeys = (SURVEY_QUESTIONS[survey.survey_type] || []).map((q) => q.key);

  // Save each response
  for (const resp of responses) {
    if (!validKeys.includes(resp.question_key)) {
      logger.warn(`Unknown question key: ${resp.question_key} for survey type ${survey.survey_type}`);
      continue;
    }

    await db.create<CandidateSurveyResponse>("candidate_survey_responses", {
      id: uuidv4(),
      survey_id: survey.id,
      organization_id: survey.organization_id,
      question_key: resp.question_key,
      rating: resp.rating ?? null,
      text_response: resp.text_response ?? null,
    } as any);
  }

  // Mark survey as completed
  await db.update<CandidateSurvey>("candidate_surveys", survey.id, {
    status: "completed",
    completed_at: new Date(),
  } as any);

  logger.info(`Survey completed: ${survey.id}`);

  return { success: true, message: "Thank you for your feedback!" };
}

// ---------------------------------------------------------------------------
// Get Survey by Token (PUBLIC — for rendering the form)
// ---------------------------------------------------------------------------

export async function getSurveyByToken(
  token: string,
): Promise<{ survey: CandidateSurvey; questions: typeof SURVEY_QUESTIONS[string] }> {
  const db = getDB();

  const survey = await db.findOne<CandidateSurvey>("candidate_surveys", { token });
  if (!survey) throw new NotFoundError("Survey");

  const questions = SURVEY_QUESTIONS[survey.survey_type] || SURVEY_QUESTIONS.post_interview;

  return { survey, questions };
}

// ---------------------------------------------------------------------------
// List Surveys (Admin)
// ---------------------------------------------------------------------------

export async function listSurveys(
  orgId: number,
  options?: { survey_type?: SurveyType; status?: string; page?: number; limit?: number },
): Promise<{ data: CandidateSurvey[]; total: number; page: number; limit: number }> {
  const db = getDB();
  const filters: Record<string, any> = { organization_id: orgId };
  if (options?.survey_type) filters.survey_type = options.survey_type;
  if (options?.status) filters.status = options.status;

  const result = await db.findMany<CandidateSurvey>("candidate_surveys", {
    filters,
    sort: { field: "sent_at", order: "desc" },
    page: options?.page ?? 1,
    limit: options?.limit ?? 20,
  });

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

// ---------------------------------------------------------------------------
// Get Survey Results
// ---------------------------------------------------------------------------

export async function getSurveyResults(
  orgId: number,
  surveyId: string,
): Promise<{ survey: CandidateSurvey; responses: CandidateSurveyResponse[] }> {
  const db = getDB();

  const survey = await db.findOne<CandidateSurvey>("candidate_surveys", {
    id: surveyId,
    organization_id: orgId,
  });
  if (!survey) throw new NotFoundError("Survey", surveyId);

  const responsesResult = await db.findMany<CandidateSurveyResponse>("candidate_survey_responses", {
    filters: { survey_id: surveyId, organization_id: orgId },
    limit: 100,
  });

  return { survey, responses: responsesResult.data };
}

// ---------------------------------------------------------------------------
// Candidate NPS Calculation
// ---------------------------------------------------------------------------

export async function calculateNPS(
  orgId: number,
  options?: { survey_type?: SurveyType; from_date?: string; to_date?: string },
): Promise<{
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  total_responses: number;
  breakdown: Record<string, number>;
}> {
  const db = getDB();

  // Get all completed surveys for the org
  let query = `
    SELECT csr.rating
    FROM candidate_survey_responses csr
    JOIN candidate_surveys cs ON cs.id = csr.survey_id
    WHERE cs.organization_id = ?
      AND cs.status = 'completed'
      AND csr.question_key = 'recommend_likelihood'
      AND csr.rating IS NOT NULL
  `;
  const params: any[] = [orgId];

  if (options?.survey_type) {
    query += ` AND cs.survey_type = ?`;
    params.push(options.survey_type);
  }

  if (options?.from_date) {
    query += ` AND cs.completed_at >= ?`;
    params.push(options.from_date);
  }

  if (options?.to_date) {
    query += ` AND cs.completed_at <= ?`;
    params.push(options.to_date);
  }

  const rows = await db.raw<any[][]>(query, params);
  const ratings = (rows[0] || []) as Array<{ rating: number }>;

  if (ratings.length === 0) {
    return {
      nps: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      total_responses: 0,
      breakdown: {},
    };
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  const breakdown: Record<string, number> = {};

  for (const { rating } of ratings) {
    const key = String(rating);
    breakdown[key] = (breakdown[key] || 0) + 1;

    if (rating >= 9) promoters++;
    else if (rating >= 7) passives++;
    else detractors++;
  }

  const total = ratings.length;
  const nps = Math.round(((promoters - detractors) / total) * 100);

  return {
    nps,
    promoters,
    passives,
    detractors,
    total_responses: total,
    breakdown,
  };
}
