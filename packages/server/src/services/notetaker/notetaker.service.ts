// ============================================================================
// NOTETAKER SERVICE
//
// Orchestrates the AI interview assistant:
//   - dispatchBot        : send the notetaker into an interview's meeting.
//   - handleWebhook      : when the vendor says "done", fetch the transcript,
//                          run the Claude evaluation, and store the result.
//   - getSession         : the notetaker session + evaluation for an interview.
//
// Vendor-agnostic via INotetakerProvider (Recall.ai is the reference impl).
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { ValidationError, NotFoundError } from "../../utils/errors";
import { INotetakerProvider } from "./provider.interface";
import { RecallProvider } from "./recall.provider";
import { evaluateInterview } from "./interview-eval.service";

// Single configured provider (swap here or make org-configurable later).
const provider: INotetakerProvider = new RecallProvider();

function webhookUrl(): string {
  const base = process.env.PUBLIC_API_URL || `http://localhost:${config.port}`;
  return `${base}/api/v1/notetaker/webhook`;
}

export function isConfigured(): boolean {
  return provider.isConfigured();
}

// ---------------------------------------------------------------------------
// Dispatch a notetaker bot into the interview's meeting.
// ---------------------------------------------------------------------------
export async function dispatchBot(orgId: number, interviewId: string): Promise<any> {
  const knex = getDB().knex();
  const interview = await knex("interviews").where({ id: interviewId, organization_id: orgId }).first();
  if (!interview) throw new NotFoundError("Interview");
  if (!interview.meeting_link) {
    throw new ValidationError("This interview has no meeting link — generate one first");
  }
  if (!provider.isConfigured()) {
    throw new ValidationError(
      "The notetaker isn't configured. Add RECALL_API_KEY on the server to enable the AI interview assistant.",
    );
  }

  // One active session per interview.
  const existing = await knex("interview_notetaker_sessions")
    .where({ interview_id: interviewId })
    .whereNotIn("status", ["failed"])
    .first();
  if (existing && existing.status !== "completed") {
    return { id: existing.id, status: existing.status, message: "Notetaker already dispatched" };
  }

  const sessionId = uuidv4();
  await knex("interview_notetaker_sessions").insert({
    id: sessionId,
    organization_id: orgId,
    interview_id: interviewId,
    provider: provider.provider,
    status: "requested",
    meeting_url: interview.meeting_link,
    created_at: new Date(),
    updated_at: new Date(),
  });

  try {
    const bot = await provider.sendBot({
      meetingUrl: interview.meeting_link,
      botName: `EMP Recruit · ${interview.title || "Interview"}`,
      webhookUrl: webhookUrl(),
    });
    await knex("interview_notetaker_sessions").where({ id: sessionId }).update({
      external_bot_id: bot.botId,
      status: "joining",
      updated_at: new Date(),
    });
    logger.info(`Notetaker bot ${bot.botId} dispatched for interview ${interviewId}`);
    return { id: sessionId, status: "joining", bot_id: bot.botId };
  } catch (err) {
    await knex("interview_notetaker_sessions").where({ id: sessionId }).update({
      status: "failed",
      error: (err as Error).message,
      updated_at: new Date(),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Webhook — the vendor tells us when the recording/transcript is ready.
// ---------------------------------------------------------------------------
export async function handleWebhook(body: any): Promise<void> {
  const evt = provider.parseWebhook(body);
  if (!evt.botId) return;
  const knex = getDB().knex();
  const session = await knex("interview_notetaker_sessions").where({ external_bot_id: evt.botId }).first();
  if (!session) {
    logger.warn(`Notetaker webhook for unknown bot ${evt.botId}`);
    return;
  }

  // Reflect intermediate statuses.
  if (!evt.ready) {
    const map: Record<string, string> = {
      in_call_recording: "recording",
      in_call: "recording",
      joining_call: "joining",
    };
    const next = map[evt.status];
    if (next && next !== session.status) {
      await knex("interview_notetaker_sessions").where({ id: session.id }).update({ status: next, updated_at: new Date() });
    }
    return;
  }

  // Ready → fetch transcript, evaluate, store.
  await knex("interview_notetaker_sessions").where({ id: session.id }).update({ status: "transcribing", updated_at: new Date() });
  try {
    const transcript = await provider.getTranscript(evt.botId);

    // Job context for the evaluation.
    const ctx = await knex("interviews as i")
      .join("applications as a", "i.application_id", "a.id")
      .join("job_postings as j", "a.job_id", "j.id")
      .where("i.id", session.interview_id)
      .select("i.type as interview_type", "j.title as job_title", "j.description as job_description")
      .first();

    const evaluation = await evaluateInterview(transcript.text, {
      jobTitle: ctx?.job_title,
      jobDescription: ctx?.job_description,
      interviewType: ctx?.interview_type,
    });

    await knex("interview_notetaker_sessions").where({ id: session.id }).update({
      status: "completed",
      transcript: transcript.text,
      transcript_json: transcript.structured ? JSON.stringify(transcript.structured) : null,
      duration_seconds: transcript.durationSeconds ?? null,
      ai_score: evaluation.score,
      ai_recommendation: evaluation.recommendation,
      ai_summary: evaluation.summary,
      ai_analysis_json: JSON.stringify(evaluation.analysis),
      completed_at: new Date(),
      updated_at: new Date(),
    });
    logger.info(`Notetaker session ${session.id} completed — AI score ${evaluation.score} (${evaluation.recommendation})`);
  } catch (err) {
    await knex("interview_notetaker_sessions").where({ id: session.id }).update({
      status: "failed",
      error: (err as Error).message,
      updated_at: new Date(),
    });
    logger.error(`Notetaker transcript/eval failed for ${session.id}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Read the notetaker session (status + evaluation) for an interview.
// ---------------------------------------------------------------------------
export async function getSession(orgId: number, interviewId: string): Promise<any | null> {
  const knex = getDB().knex();
  const s = await knex("interview_notetaker_sessions")
    .where({ organization_id: orgId, interview_id: interviewId })
    .orderBy("created_at", "desc")
    .first();
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    provider: s.provider,
    duration_seconds: s.duration_seconds,
    transcript: s.transcript,
    ai_score: s.ai_score,
    ai_recommendation: s.ai_recommendation,
    ai_summary: s.ai_summary,
    ai_analysis: safeJson(s.ai_analysis_json),
    error: s.error,
    completed_at: s.completed_at,
  };
}

// Manual path: evaluate a pasted/uploaded transcript (works with no vendor).
export async function evaluateManualTranscript(
  orgId: number,
  interviewId: string,
  transcript: string,
): Promise<any> {
  const knex = getDB().knex();
  const interview = await knex("interviews").where({ id: interviewId, organization_id: orgId }).first();
  if (!interview) throw new NotFoundError("Interview");
  if (!transcript || transcript.trim().length < 40) throw new ValidationError("Transcript is too short to evaluate");

  const ctx = await knex("interviews as i")
    .join("applications as a", "i.application_id", "a.id")
    .join("job_postings as j", "a.job_id", "j.id")
    .where("i.id", interviewId)
    .select("i.type as interview_type", "j.title as job_title", "j.description as job_description")
    .first();
  const evaluation = await evaluateInterview(transcript, {
    jobTitle: ctx?.job_title,
    jobDescription: ctx?.job_description,
    interviewType: ctx?.interview_type,
  });

  const existing = await knex("interview_notetaker_sessions").where({ interview_id: interviewId }).first();
  const row = {
    organization_id: orgId,
    interview_id: interviewId,
    provider: "manual",
    status: "completed",
    transcript,
    ai_score: evaluation.score,
    ai_recommendation: evaluation.recommendation,
    ai_summary: evaluation.summary,
    ai_analysis_json: JSON.stringify(evaluation.analysis),
    completed_at: new Date(),
    updated_at: new Date(),
  };
  if (existing) {
    await knex("interview_notetaker_sessions").where({ id: existing.id }).update(row);
  } else {
    await knex("interview_notetaker_sessions").insert({ id: uuidv4(), created_at: new Date(), ...row });
  }
  return { ...evaluation };
}

function safeJson(v: any): any {
  if (!v) return null;
  try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; }
}
