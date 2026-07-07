// ============================================================================
// SPEECH-TO-TEXT — real transcription of interview recordings.
//
// Transcribes the ACTUAL uploaded audio file (never a canned placeholder).
// Uses OpenAI's Whisper endpoint (/audio/transcriptions), which also works with
// any OpenAI-compatible provider that exposes it (via OPENAI_BASE_URL, e.g. a
// self-hosted whisper server or Groq). If no STT provider is configured we throw
// SttNotConfiguredError so the caller can surface an honest "not configured"
// state and let the recruiter paste a transcript manually — we do NOT fabricate.
// ============================================================================

import fs from "fs";
import { logger } from "../../utils/logger";
import { transcribeLocally, isLocalWhisperEnabled } from "./local-whisper.service";

export class SttNotConfiguredError extends Error {
  constructor() {
    super(
      "Automatic transcription isn't available. Enable local Whisper (default) or set a real " +
        "Whisper endpoint (STT_BASE_URL + STT_API_KEY), or paste the transcript manually.",
    );
    this.name = "SttNotConfiguredError";
  }
}

// A HOSTED Whisper endpoint is only used when explicitly configured with a
// dedicated key/base — we do NOT reuse OPENAI_API_KEY blindly, because in this
// deployment it points at OpenRouter, which has no /audio/transcriptions route.
// Set STT_API_KEY + STT_BASE_URL to use a real hosted Whisper (e.g. OpenAI).
function hostedSttConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.STT_API_KEY?.trim();
  const baseUrl = process.env.STT_BASE_URL?.trim();
  if (!apiKey || !baseUrl) return null;
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model: process.env.STT_MODEL?.trim() || "whisper-1",
  };
}

export function isSttConfigured(): boolean {
  return hostedSttConfig() !== null || isLocalWhisperEnabled();
}

/**
 * Transcribe an audio/video file on disk to plain text. Prefers a hosted Whisper
 * endpoint if explicitly configured, otherwise runs local (free, offline)
 * Whisper. Returns the real transcript produced from the actual audio bytes.
 */
export async function transcribeFile(filePath: string, mimeType?: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Recording file not found at ${filePath}`);
  }

  const cfg = hostedSttConfig();
  if (!cfg) {
    // No hosted Whisper → use free local Whisper (unless disabled).
    if (isLocalWhisperEnabled()) {
      logger.info(`Transcribing ${filePath} with local Whisper…`);
      return transcribeLocally(filePath);
    }
    throw new SttNotConfiguredError();
  }

  // Build multipart form-data with the real file bytes. Node 20+/undici support
  // Blob + FormData natively, so no extra dependency.
  const bytes = await fs.promises.readFile(filePath);
  const fileName = filePath.split(/[\\/]/).pop() || "recording";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType || "application/octet-stream" }), fileName);
  form.append("model", cfg.model);
  form.append("response_format", "verbose_json"); // gives segments with timestamps

  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Transcription failed (${res.status}): ${body}`);
  }

  const json: any = await res.json();
  // verbose_json → { text, segments: [{ start, end, text }] }. Prefer timestamped
  // segments so the transcript is readable; fall back to the plain text field.
  if (Array.isArray(json.segments) && json.segments.length) {
    return json.segments
      .map((s: any) => `[${fmtTs(s.start)}] ${String(s.text || "").trim()}`)
      .join("\n");
  }
  const text = String(json.text || "").trim();
  if (!text) throw new Error("Transcription returned empty text");
  return text;
}

function fmtTs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Log once which STT backend is active so operators know what to expect.
logger.info(
  `Speech-to-text: ${
    hostedSttConfig()
      ? "hosted Whisper (STT_BASE_URL)"
      : isLocalWhisperEnabled()
        ? "local Whisper (free, offline; model downloads on first use)"
        : "disabled — manual transcripts only"
  }`,
);
