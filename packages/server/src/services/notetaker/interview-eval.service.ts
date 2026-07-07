// ============================================================================
// AI INTERVIEW EVALUATION
//
// Given an interview transcript (and the job context), produce a candidate
// evaluation: a 0-100 score, a hire recommendation, a summary, and structured
// strengths/concerns/competencies. Uses whatever LLM the operator configured
// (OpenAI / Anthropic / Gemini / OpenAI-compatible) via the shared ai-provider
// service. Degrades to a light heuristic if no key is set, so the free
// paste-a-transcript flow always completes.
// ============================================================================

import { logger } from "../../utils/logger";
import { callLLM, isAiConfigured, activeProviderLabel } from "../ai/ai-provider.service";

export interface InterviewEvaluation {
  score: number | null; // 0-100, or null when not AI-evaluated
  // "needs_review" is the honest value when no AI produced a verdict — we do NOT
  // fabricate a hire/no-hire recommendation from keyword counts.
  recommendation: "strong_hire" | "hire" | "no_hire" | "strong_no_hire" | "needs_review";
  summary: string;
  analysis: {
    strengths: string[];
    concerns: string[];
    competencies?: { name: string; rating: number; note?: string }[];
    interviewer_sentiment?: string;
  };
  usedAI: boolean;
}

export async function evaluateInterview(
  transcript: string,
  ctx: { jobTitle?: string; jobDescription?: string; interviewType?: string },
): Promise<InterviewEvaluation> {
  const text = (transcript || "").slice(0, 40_000);
  if (isAiConfigured() && text.trim().length > 80) {
    try {
      return await evalWithLLM(text, ctx);
    } catch (err) {
      logger.warn(`Interview eval (${activeProviderLabel()}) failed, using heuristic: ${(err as Error).message}`);
    }
  }
  return heuristicEval(text);
}

async function evalWithLLM(
  transcript: string,
  ctx: { jobTitle?: string; jobDescription?: string; interviewType?: string },
): Promise<InterviewEvaluation> {
  const prompt = `You are an expert interviewer analyzing an interview transcript. Evaluate the CANDIDATE (not the interviewer) for this role.

ROLE: ${ctx.jobTitle || "(unspecified)"}
INTERVIEW TYPE: ${ctx.interviewType || "general"}
JOB CONTEXT: ${(ctx.jobDescription || "").slice(0, 2000)}

TRANSCRIPT:
${transcript}

Respond with ONLY a JSON object (no markdown, no prose) of this exact shape:
{
  "score": <0-100 integer, overall candidate performance>,
  "recommendation": "strong_hire" | "hire" | "no_hire" | "strong_no_hire",
  "summary": "<3-4 sentence assessment for the hiring team>",
  "analysis": {
    "strengths": [<specific strengths shown>],
    "concerns": [<specific concerns/red flags>],
    "competencies": [{"name":"<e.g. Technical depth>","rating":<0-100>,"note":"<brief>"}],
    "interviewer_sentiment": "<how positive the interviewer seemed, 1 line>"
  }
}`;

  const out = await callLLM(prompt, { maxTokens: 1500, temperature: 0.2, json: true });
  const parsed = extractJson(out);
  if (!parsed) throw new Error("No parseable JSON from the LLM");

  const rec = ["strong_hire", "hire", "no_hire", "strong_no_hire"].includes(parsed.recommendation)
    ? parsed.recommendation
    : recFromScore(clamp(parsed.score));
  return {
    score: clamp(parsed.score),
    recommendation: rec,
    summary: String(parsed.summary || "").slice(0, 2000),
    analysis: {
      strengths: arr(parsed.analysis?.strengths),
      concerns: arr(parsed.analysis?.concerns),
      competencies: Array.isArray(parsed.analysis?.competencies)
        ? parsed.analysis.competencies.slice(0, 12)
        : [],
      interviewer_sentiment: parsed.analysis?.interviewer_sentiment,
    },
    usedAI: true,
  };
}

function heuristicEval(_transcript: string): InterviewEvaluation {
  // No AI provider configured. We do NOT fabricate a score or a hire/no-hire
  // recommendation from keyword counts (that would be misleading). Instead we
  // return an honest "needs review" result so the UI clearly shows the interview
  // hasn't been AI-evaluated and prompts the reviewer to read the transcript or
  // configure an AI provider.
  return {
    score: null,
    recommendation: "needs_review",
    summary:
      "Not AI-evaluated — no AI provider is configured. Set an AI provider key (e.g. OPENAI_API_KEY) in .env to get a real assessment, or review the transcript manually.",
    analysis: { strengths: [], concerns: [], competencies: [] },
    usedAI: false,
  };
}

function clamp(n: any): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
}
function recFromScore(s: number): InterviewEvaluation["recommendation"] {
  if (s >= 80) return "strong_hire";
  if (s >= 60) return "hire";
  if (s >= 40) return "no_hire";
  return "strong_no_hire";
}
function arr(v: any): string[] {
  return Array.isArray(v) ? v.map(String).slice(0, 20) : [];
}
function extractJson(text: string): any | null {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
