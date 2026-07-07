// ============================================================================
// PSYCHOMETRIC ASSESSMENT SERVICE
// Manages assessment templates, candidate invitations, test-taking, auto-scoring.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { sendEmail } from "../email/email.service";
import { callLLM, isAiConfigured, AiUnavailableError, friendlyAiError } from "../ai/ai-provider.service";
import type {
  AssessmentTemplate,
  CandidateAssessment,
  AssessmentResponse,
  AssessmentType,
  AssessmentQuestion,
} from "@emp-recruit/shared";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function createTemplate(
  orgId: number,
  data: {
    name: string;
    description?: string;
    assessment_type: AssessmentType;
    time_limit_minutes?: number;
    questions: AssessmentQuestion[];
  },
): Promise<AssessmentTemplate> {
  const db = getDB();

  if (!data.questions || data.questions.length === 0) {
    throw new ValidationError("At least one question is required");
  }

  const id = uuidv4();

  const record = await db.create<AssessmentTemplate>("assessment_templates", {
    id,
    organization_id: orgId,
    name: data.name,
    description: data.description || null,
    assessment_type: data.assessment_type,
    time_limit_minutes: data.time_limit_minutes ?? null,
    questions: JSON.stringify(data.questions),
    is_active: true,
  } as any);

  return record;
}

// ---------------------------------------------------------------------------
// AI generation of assessment questions
// ---------------------------------------------------------------------------
export interface GeneratedAssessment {
  name: string;
  description: string;
  questions: AssessmentQuestion[];
  usedAI: boolean;
}

/**
 * Generate a full assessment (name, description, questions) with the AI, based
 * on a job (or a free-text topic) + type + count + difficulty. Falls back to a
 * clear error if no AI is configured (we do NOT fabricate a canned quiz).
 */
export async function generateAssessment(
  orgId: number,
  opts: {
    job_id?: string;
    topic?: string;
    assessment_type: AssessmentType;
    num_questions: number;
    difficulty: "easy" | "medium" | "hard";
    question_type?: "multiple_choice" | "true_false" | "mixed" | "coding";
  },
): Promise<GeneratedAssessment> {
  if (!isAiConfigured()) {
    throw new AiUnavailableError(
      "AI generation isn't available right now. Please contact your administrator to enable it.",
      503,
    );
  }

  // Pull job context if a job was chosen, so questions are role-relevant.
  let jobContext = "";
  let jobTitle = opts.topic || "";
  if (opts.job_id) {
    const db = getDB();
    const job = await db.findOne<any>("job_postings", { id: opts.job_id, organization_id: orgId });
    if (job) {
      jobTitle = job.title;
      let skills: string[] = [];
      try { skills = typeof job.skills === "string" ? JSON.parse(job.skills) : job.skills || []; } catch { /* */ }
      jobContext =
        `JOB TITLE: ${job.title}\n` +
        `DEPARTMENT: ${job.department || "-"}\n` +
        `REQUIRED SKILLS: ${skills.join(", ") || "-"}\n` +
        `DESCRIPTION: ${stripTags(job.description || "").slice(0, 1500)}\n` +
        `REQUIREMENTS: ${stripTags(job.requirements || "").slice(0, 1000)}`;
    }
  }

  const n = Math.max(1, Math.min(30, opts.num_questions));
  const qType = opts.question_type || "multiple_choice";
  const isCoding = qType === "coding";
  const typeInstruction =
    qType === "true_false"
      ? "All questions must be true_false (options ['True','False'])."
      : qType === "mixed"
        ? "Mix multiple_choice (4 options) and true_false questions."
        : isCoding
          ? "All questions must be type 'text' — real coding/technical problems the candidate answers by WRITING code or a technical explanation. State the problem clearly (include example input/output for coding tasks). Leave options empty and correct_answer as a concise model-answer / expected-approach that a reviewer can compare against."
          : "All questions must be multiple_choice with exactly 4 options.";

  const prompt = `You are an expert ${isCoding ? "technical interviewer creating a pre-interview coding test" : "assessment designer"}. Create a ${opts.difficulty} ${
    isCoding ? "coding/technical" : opts.assessment_type
  } assessment${jobTitle ? ` for the role/topic: "${jobTitle}"` : ""}.

${jobContext ? `JOB CONTEXT:\n${jobContext}\n` : ""}
Requirements:
- Exactly ${n} questions.
- Difficulty: ${opts.difficulty}.
- ${typeInstruction}
${isCoding ? "- Cover practical problems relevant to the role (algorithms, debugging, system/API design, or language-specific tasks)." : "- Each question must have a single correct_answer that EXACTLY matches one of its options."}
- Questions must genuinely test relevant ${isCoding ? "engineering ability" : "knowledge/aptitude"} for this role.

Respond with ONLY a JSON object (no markdown, no prose) of this exact shape:
{
  "name": "<short assessment name>",
  "description": "<1 sentence description>",
  "questions": [
    ${isCoding
      ? '{ "question": "<problem statement with example input/output>", "type": "text", "options": [], "correct_answer": "<model answer / expected approach>" }'
      : '{ "question": "<text>", "type": "multiple_choice", "options": ["A","B","C","D"], "correct_answer": "A" }'}
  ]
}`;

  // Coding tests need more thinking time than MCQs; give a larger budget.
  let raw: string;
  try {
    raw = await callLLM(prompt, {
      maxTokens: isCoding ? 6000 : 4000,
      temperature: 0.5,
      json: true,
      timeoutMs: isCoding ? 120_000 : 75_000,
      maxAttempts: 3,
    });
  } catch (err) {
    // Convert raw provider errors (429 / timeout / etc.) into a clean message.
    throw friendlyAiError(err);
  }
  const parsed = extractJsonObject(raw);
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new AiUnavailableError("The AI couldn't generate questions this time. Please try again.", 502);
  }

  // Sanitize each question into the exact AssessmentQuestion shape.
  const questions: AssessmentQuestion[] = parsed.questions
    .map((q: any): AssessmentQuestion | null => {
      const text = String(q.question || "").trim();
      if (!text) return null;
      let type: AssessmentQuestion["type"] = q.type === "true_false" ? "true_false" : q.type === "text" ? "text" : q.type === "scale" ? "scale" : "multiple_choice";
      let options: string[] =
        type === "true_false" ? ["True", "False"]
          : type === "scale" ? ["1", "2", "3", "4", "5"]
            : Array.isArray(q.options) ? q.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
      if (type === "multiple_choice" && options.length < 2) return null;
      let correct: string | null = q.correct_answer != null ? String(q.correct_answer).trim() : null;
      // Ensure the correct answer is one of the options.
      if (correct && options.length && !options.includes(correct)) {
        const match = options.find((o) => o.toLowerCase() === correct!.toLowerCase());
        correct = match ?? options[0];
      }
      return { question: text, type, options, correct_answer: correct };
    })
    .filter(Boolean)
    .slice(0, n) as AssessmentQuestion[];

  if (questions.length === 0) {
    throw new AiUnavailableError("The AI couldn't generate usable questions this time. Please try again.", 502);
  }

  return {
    name: String(parsed.name || `${jobTitle || opts.assessment_type} assessment`).slice(0, 200),
    description: String(parsed.description || "").slice(0, 500),
    questions,
    usedAI: true,
  };
}

function stripTags(s: string): string {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Robust JSON object extraction (fenced / reasoning / balanced-brace).
function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const candidates: string[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) candidates.push(m[1]);
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start !== -1) { candidates.push(text.slice(start, i + 1)); start = -1; } }
  }
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e > s) candidates.push(text.slice(s, e + 1));
  let best: any = null;
  for (const c of candidates) {
    try {
      const p = JSON.parse(c);
      if (p && typeof p === "object") { if (Array.isArray(p.questions)) return p; best = best ?? p; }
    } catch { /* next */ }
  }
  return best;
}

export async function listTemplates(
  orgId: number,
  options?: { assessment_type?: AssessmentType },
): Promise<AssessmentTemplate[]> {
  const db = getDB();
  const filters: Record<string, any> = { organization_id: orgId, is_active: true };
  if (options?.assessment_type) filters.assessment_type = options.assessment_type;

  const result = await db.findMany<AssessmentTemplate>("assessment_templates", {
    filters,
    limit: 100,
    sort: { field: "created_at", order: "desc" },
  });
  return result.data;
}

export async function getTemplate(
  orgId: number,
  templateId: string,
): Promise<AssessmentTemplate> {
  const db = getDB();
  const template = await db.findOne<AssessmentTemplate>("assessment_templates", {
    id: templateId,
    organization_id: orgId,
  });
  if (!template) throw new NotFoundError("Assessment template", templateId);
  return template;
}

// ---------------------------------------------------------------------------
// Invite Candidate
// ---------------------------------------------------------------------------

export async function inviteCandidate(
  orgId: number,
  data: {
    candidate_id: string;
    template_id: string;
  },
): Promise<CandidateAssessment> {
  const db = getDB();

  // Verify candidate
  const candidate = await db.findOne<any>("candidates", {
    id: data.candidate_id,
    organization_id: orgId,
  });
  if (!candidate) throw new NotFoundError("Candidate", data.candidate_id);

  // Verify template
  const template = await db.findOne<AssessmentTemplate>("assessment_templates", {
    id: data.template_id,
    organization_id: orgId,
  });
  if (!template) throw new NotFoundError("Assessment template", data.template_id);

  // Check for existing active assessment
  const existing = await db.findOne<CandidateAssessment>("candidate_assessments", {
    candidate_id: data.candidate_id,
    template_id: data.template_id,
    organization_id: orgId,
  });
  if (existing && (existing.status === "invited" || existing.status === "started")) {
    throw new ValidationError("Candidate already has an active assessment for this template");
  }

  const id = uuidv4();
  const token = crypto.randomBytes(48).toString("hex");

  // Calculate max_score from the template questions
  const questions: AssessmentQuestion[] = typeof template.questions === "string"
    ? JSON.parse(template.questions)
    : template.questions;
  const maxScore = questions.filter((q) => q.correct_answer !== undefined && q.correct_answer !== null).length;

  const record = await db.create<CandidateAssessment>("candidate_assessments", {
    id,
    organization_id: orgId,
    candidate_id: data.candidate_id,
    template_id: data.template_id,
    status: "invited",
    token,
    started_at: null,
    completed_at: null,
    score: null,
    max_score: maxScore || null,
    percentile: null,
    result_summary: null,
  } as any);

  // Actually EMAIL the candidate the assessment link (previously this only
  // logged "sent" without sending anything). Best-effort: a mail failure must
  // not roll back the invitation record.
  if (candidate.email) {
    const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:5179";
    const link = `${appUrl}/assessment/${token}`;
    const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || "there";
    const timeNote = template.time_limit_minutes ? ` It has a ${template.time_limit_minutes}-minute time limit.` : "";
    const html =
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>You've been invited to complete the <strong>${escapeHtml(template.name)}</strong> assessment.${timeNote}</p>` +
      `<p><a href="${link}" style="background:#4F46E5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Start assessment</a></p>` +
      `<p>Or paste this link into your browser:<br>${link}</p>`;
    sendEmail(candidate.email, `Assessment invitation: ${template.name}`, html).catch((err) =>
      logger.warn(`Assessment invite email to ${candidate.email} failed: ${err.message}`),
    );
    logger.info(`Assessment invitation emailed to ${candidate.email} (${id})`);
  } else {
    logger.warn(`Assessment ${id} created but candidate has no email — share the link manually.`);
  }

  return record;
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Take Assessment (PUBLIC — via token)
// ---------------------------------------------------------------------------

/**
 * Get assessment questions for a candidate (via token). Starts the assessment.
 */
export async function getAssessmentByToken(
  token: string,
): Promise<{
  assessment: CandidateAssessment;
  template: { name: string; description: string | null; assessment_type: string; time_limit_minutes: number | null };
  questions: Array<{ index: number; question: string; options: string[]; type: string }>;
}> {
  const db = getDB();

  const assessment = await db.findOne<CandidateAssessment>("candidate_assessments", { token });
  if (!assessment) throw new NotFoundError("Assessment");

  if (assessment.status === "completed") {
    throw new ValidationError("This assessment has already been completed");
  }

  if (assessment.status === "expired") {
    throw new ValidationError("This assessment has expired");
  }

  // Mark as started if not already
  if (assessment.status === "invited") {
    await db.update<CandidateAssessment>("candidate_assessments", assessment.id, {
      status: "started",
      started_at: new Date(),
    } as any);
    assessment.status = "started" as any;
    assessment.started_at = new Date().toISOString();
  }

  const template = await db.findById<AssessmentTemplate>("assessment_templates", assessment.template_id);
  if (!template) throw new NotFoundError("Assessment template", assessment.template_id);

  // Parse questions and strip correct answers (candidates must not see them)
  const allQuestions: AssessmentQuestion[] = typeof template.questions === "string"
    ? JSON.parse(template.questions)
    : template.questions;

  const questions = allQuestions.map((q, index) => ({
    index,
    question: q.question,
    options: q.options || [],
    type: q.type,
  }));

  return {
    assessment,
    template: {
      name: template.name,
      description: template.description,
      assessment_type: template.assessment_type,
      time_limit_minutes: template.time_limit_minutes,
    },
    questions,
  };
}

// ---------------------------------------------------------------------------
// Submit Assessment (PUBLIC — via token)
// ---------------------------------------------------------------------------

export async function submitAssessment(
  token: string,
  answers: Array<{ question_index: number; answer: string; time_taken_seconds?: number }>,
): Promise<{
  score: number;
  max_score: number;
  percentile: number | null;
  result_summary: Record<string, any>;
}> {
  const db = getDB();

  const assessment = await db.findOne<CandidateAssessment>("candidate_assessments", { token });
  if (!assessment) throw new NotFoundError("Assessment");

  if (assessment.status === "completed") {
    throw new ValidationError("This assessment has already been submitted");
  }

  if (assessment.status === "expired") {
    throw new ValidationError("This assessment has expired");
  }

  if (assessment.status === "invited") {
    throw new ValidationError("Assessment must be started before submitting");
  }

  // Get template and questions
  const template = await db.findById<AssessmentTemplate>("assessment_templates", assessment.template_id);
  if (!template) throw new NotFoundError("Assessment template", assessment.template_id);

  const allQuestions: AssessmentQuestion[] = typeof template.questions === "string"
    ? JSON.parse(template.questions)
    : template.questions;

  // Score the assessment
  let correctCount = 0;
  let scoredCount = 0;

  for (const ans of answers) {
    if (ans.question_index < 0 || ans.question_index >= allQuestions.length) continue;

    const question = allQuestions[ans.question_index];
    let isCorrect: boolean | null = null;

    // Auto-score if question has a correct answer
    if (question.correct_answer !== undefined && question.correct_answer !== null) {
      isCorrect = String(ans.answer).toLowerCase().trim() === String(question.correct_answer).toLowerCase().trim();
      scoredCount++;
      if (isCorrect) correctCount++;
    }

    // Save response
    await db.create<AssessmentResponse>("assessment_responses", {
      id: uuidv4(),
      assessment_id: assessment.id,
      organization_id: assessment.organization_id,
      question_index: ans.question_index,
      answer: ans.answer,
      is_correct: isCorrect,
      time_taken_seconds: ans.time_taken_seconds ?? null,
    } as any);
  }

  // Calculate score
  const maxScore = scoredCount;
  const score = correctCount;

  // Calculate percentile based on other assessments for this template
  let percentile: number | null = null;
  try {
    const prevScores = await db.raw<any[][]>(
      `SELECT score FROM candidate_assessments
       WHERE template_id = ? AND organization_id = ? AND status = 'completed' AND score IS NOT NULL`,
      [assessment.template_id, assessment.organization_id],
    );
    const scores = (prevScores[0] || []) as Array<{ score: number }>;
    if (scores.length > 0) {
      const below = scores.filter((s) => s.score < score).length;
      percentile = Math.round((below / scores.length) * 100);
    }
  } catch (err) {
    logger.warn("Failed to calculate percentile:", err);
  }

  // Build result summary
  const totalTimeTaken = answers.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0);
  const resultSummary = {
    total_questions: allQuestions.length,
    answered: answers.length,
    correct: correctCount,
    incorrect: scoredCount - correctCount,
    unanswered: allQuestions.length - answers.length,
    score_percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    total_time_seconds: totalTimeTaken,
    average_time_per_question: answers.length > 0 ? Math.round(totalTimeTaken / answers.length) : 0,
  };

  // Update assessment record
  await db.update<CandidateAssessment>("candidate_assessments", assessment.id, {
    status: "completed",
    completed_at: new Date(),
    score,
    max_score: maxScore,
    percentile,
    result_summary: JSON.stringify(resultSummary),
  } as any);

  logger.info(
    `Assessment completed: ${assessment.id} — score: ${score}/${maxScore}`,
  );

  return {
    score,
    max_score: maxScore,
    percentile,
    result_summary: resultSummary,
  };
}

// ---------------------------------------------------------------------------
// Get Results (Admin)
// ---------------------------------------------------------------------------

export async function getAssessmentResults(
  orgId: number,
  assessmentId: string,
): Promise<{
  assessment: CandidateAssessment;
  responses: AssessmentResponse[];
  template: AssessmentTemplate;
}> {
  const db = getDB();

  const assessment = await db.findOne<CandidateAssessment>("candidate_assessments", {
    id: assessmentId,
    organization_id: orgId,
  });
  if (!assessment) throw new NotFoundError("Assessment", assessmentId);

  const template = await db.findById<AssessmentTemplate>("assessment_templates", assessment.template_id);
  if (!template) throw new NotFoundError("Assessment template", assessment.template_id);

  const responsesResult = await db.findMany<AssessmentResponse>("assessment_responses", {
    filters: { assessment_id: assessmentId, organization_id: orgId },
    limit: 500,
    sort: { field: "question_index", order: "asc" },
  });

  return {
    assessment,
    responses: responsesResult.data,
    template,
  };
}

export async function listCandidateAssessments(
  orgId: number,
  candidateId: string,
): Promise<CandidateAssessment[]> {
  const db = getDB();
  const result = await db.findMany<CandidateAssessment>("candidate_assessments", {
    filters: { organization_id: orgId, candidate_id: candidateId },
    sort: { field: "created_at", order: "desc" },
    limit: 100,
  });
  return result.data;
}
