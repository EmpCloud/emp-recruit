// ============================================================================
// RECORDING & TRANSCRIPT SERVICE
// Handles interview recording uploads, transcript generation, and management.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { getDB } from "../../db/adapters";
import { NotFoundError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { transcribeFile } from "../ai/speech-to-text.service";
import { probeDurationSeconds } from "../media/media-probe.util";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterviewRecording {
  id: string;
  organization_id: number;
  interview_id: string;
  file_path: string;
  file_size: number | null;
  duration_seconds: number | null;
  mime_type: string | null;
  uploaded_by: number;
  uploaded_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface InterviewTranscript {
  id: string;
  organization_id: number;
  interview_id: string;
  recording_id: string | null;
  content: string;
  summary: string | null;
  status: "processing" | "completed" | "failed";
  generated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Upload a recording
// ---------------------------------------------------------------------------

export async function uploadRecording(
  orgId: number,
  interviewId: string,
  file: Express.Multer.File,
  uploadedBy: number,
): Promise<InterviewRecording> {
  const db = getDB();

  // Verify interview belongs to org
  const interview = await db.findOne("interviews", {
    id: interviewId,
    organization_id: orgId,
  });
  if (!interview) {
    throw new NotFoundError("Interview", interviewId);
  }

  const now = new Date();
  const recordingId = uuidv4();

  // Extract the real media duration from the uploaded file (ffprobe). Null only
  // if probing genuinely fails — never a fabricated value.
  const durationSeconds = await probeDurationSeconds(file.path);

  const recording = await db.create<InterviewRecording>("interview_recordings", {
    id: recordingId,
    organization_id: orgId,
    interview_id: interviewId,
    file_path: file.path.replace(/\\/g, "/"),
    file_size: file.size,
    duration_seconds: durationSeconds,
    mime_type: file.mimetype,
    uploaded_by: uploadedBy,
    uploaded_at: now,
    created_at: now,
    updated_at: now,
  });

  logger.info(`Recording uploaded for interview ${interviewId} by user ${uploadedBy}`);

  return recording;
}

// ---------------------------------------------------------------------------
// Get a single recording
// ---------------------------------------------------------------------------

export async function getRecording(
  orgId: number,
  recordingId: string,
): Promise<InterviewRecording> {
  const db = getDB();

  const recording = await db.findOne<InterviewRecording>("interview_recordings", {
    id: recordingId,
    organization_id: orgId,
  });
  if (!recording) {
    throw new NotFoundError("Recording", recordingId);
  }

  return recording;
}

// ---------------------------------------------------------------------------
// List recordings for an interview
// ---------------------------------------------------------------------------

export async function getRecordings(
  orgId: number,
  interviewId: string,
): Promise<InterviewRecording[]> {
  const db = getDB();

  const result = await db.findMany<InterviewRecording>("interview_recordings", {
    filters: { organization_id: orgId, interview_id: interviewId },
    sort: { field: "uploaded_at", order: "desc" },
    limit: 100,
  });

  return result.data;
}

// ---------------------------------------------------------------------------
// Delete a recording
// ---------------------------------------------------------------------------

export async function deleteRecording(
  orgId: number,
  recordingId: string,
): Promise<void> {
  const db = getDB();

  const recording = await db.findOne<InterviewRecording>("interview_recordings", {
    id: recordingId,
    organization_id: orgId,
  });
  if (!recording) {
    throw new NotFoundError("Recording", recordingId);
  }

  // Delete the file from disk
  try {
    const filePath = path.resolve(recording.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn(`Failed to delete recording file: ${recording.file_path}`, err);
  }

  // Delete any transcripts linked to this recording
  await db.deleteMany("interview_transcripts", { recording_id: recordingId });

  // Delete the DB record
  await db.delete("interview_recordings", recordingId);

  logger.info(`Recording ${recordingId} deleted`);
}

// ---------------------------------------------------------------------------
// Generate transcript from a recording
// ---------------------------------------------------------------------------

export async function generateTranscript(
  orgId: number,
  interviewId: string,
  recordingId: string,
): Promise<InterviewTranscript> {
  const db = getDB();

  // Verify recording belongs to org and interview
  const recording = await db.findOne<InterviewRecording>("interview_recordings", {
    id: recordingId,
    organization_id: orgId,
    interview_id: interviewId,
  });
  if (!recording) {
    throw new NotFoundError("Recording", recordingId);
  }

  const now = new Date();
  const transcriptId = uuidv4();

  // Transcribe the ACTUAL recording via Whisper. If STT isn't configured, we do
  // NOT fabricate a transcript — we persist a failed row with an honest reason
  // so the UI tells the recruiter to configure STT or paste a transcript.
  let content: string;
  let status: "completed" | "failed";
  let errorNote: string | null = null;
  try {
    const absPath = path.isAbsolute(recording.file_path)
      ? recording.file_path
      : path.resolve(recording.file_path);
    content = await transcribeFile(absPath, recording.mime_type ?? undefined);
    status = "completed";
    logger.info(`Transcript generated (real STT) for recording ${recordingId}`);
  } catch (err: any) {
    content = "";
    status = "failed";
    errorNote = err?.message || "Transcription failed";
    logger.warn(`Transcription failed for recording ${recordingId}: ${errorNote}`);
  }

  const transcript = await db.create<InterviewTranscript>("interview_transcripts", {
    id: transcriptId,
    organization_id: orgId,
    interview_id: interviewId,
    recording_id: recordingId,
    content,
    summary: errorNote, // surface the reason on failure; null on success until AI summary runs
    status,
    generated_at: now,
    created_at: now,
    updated_at: now,
  });

  return transcript;
}

// ---------------------------------------------------------------------------
// Get transcript for an interview
// ---------------------------------------------------------------------------

export async function getTranscript(
  orgId: number,
  interviewId: string,
): Promise<InterviewTranscript | null> {
  const db = getDB();

  const transcript = await db.findOne<InterviewTranscript>("interview_transcripts", {
    organization_id: orgId,
    interview_id: interviewId,
  });

  return transcript;
}

// ---------------------------------------------------------------------------
// Update transcript summary
// ---------------------------------------------------------------------------

export async function updateTranscriptSummary(
  orgId: number,
  transcriptId: string,
  summary: string,
): Promise<InterviewTranscript> {
  const db = getDB();

  const transcript = await db.findOne<InterviewTranscript>("interview_transcripts", {
    id: transcriptId,
    organization_id: orgId,
  });
  if (!transcript) {
    throw new NotFoundError("Transcript", transcriptId);
  }

  const updated = await db.update<InterviewTranscript>("interview_transcripts", transcriptId, {
    summary,
    updated_at: new Date(),
  });

  return updated;
}
