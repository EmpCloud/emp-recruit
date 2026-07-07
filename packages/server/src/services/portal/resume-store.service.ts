// ============================================================================
// RESUME STORE SERVICE
//
// Resumes are stored AS A BLOB IN MYSQL (resume_files.content LONGBLOB) — never
// on local disk. This service is the only place that reads/writes those bytes.
// It also extracts plain text (for AI parsing + search) at store time.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";
import { ValidationError, NotFoundError } from "../../utils/errors";
import { extractResumeText } from "./resume-parse.util";

const MAX_RESUME_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export async function storeResume(params: {
  accountId?: string | null;
  organizationId?: number | null;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<string> {
  if (!params.buffer?.length) throw new ValidationError("Empty resume file");
  if (params.buffer.length > MAX_RESUME_BYTES) {
    throw new ValidationError("Resume exceeds the 8 MB limit");
  }
  if (!ALLOWED_MIMES.has(params.mimeType)) {
    throw new ValidationError("Resume must be a PDF, Word doc, or text file");
  }

  const knex = getDB().knex();
  const id = uuidv4();

  // Extract text now so the AI parser + search have it immediately.
  let parsedText: string | null = null;
  try {
    parsedText = await extractResumeText(params.buffer, params.mimeType);
  } catch (err) {
    logger.warn(`Resume text extraction failed: ${(err as Error).message}`);
  }

  await knex("resume_files").insert({
    id,
    account_id: params.accountId ?? null,
    organization_id: params.organizationId ?? null,
    file_name: params.fileName.slice(0, 255),
    mime_type: params.mimeType,
    size_bytes: params.buffer.length,
    content: params.buffer,
    parsed_text: parsedText,
    created_at: new Date(),
  });

  return id;
}

export async function getResumeMeta(id: string): Promise<{
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  parsed_text: string | null;
} | null> {
  const knex = getDB().knex();
  return (
    (await knex("resume_files")
      .where({ id })
      .select("id", "file_name", "mime_type", "size_bytes", "parsed_text")
      .first()) || null
  );
}

// Stream the raw bytes back (recruiter download / candidate preview).
export async function getResumeContent(id: string): Promise<{
  fileName: string;
  mimeType: string;
  content: Buffer;
}> {
  const knex = getDB().knex();
  const row = await knex("resume_files").where({ id }).first();
  if (!row) throw new NotFoundError("Resume");
  return {
    fileName: row.file_name,
    mimeType: row.mime_type,
    content: Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content),
  };
}

// Ownership-scoped fetch for the candidate portal: the resume MUST belong to the
// requesting account. Prevents IDOR (a candidate reading another candidate's
// resume by guessing/enumerating file ids).
export async function getResumeContentForAccount(id: string, accountId: string): Promise<{
  fileName: string;
  mimeType: string;
  content: Buffer;
}> {
  const knex = getDB().knex();
  const row = await knex("resume_files").where({ id, account_id: accountId }).first();
  if (!row) throw new NotFoundError("Resume");
  return {
    fileName: row.file_name,
    mimeType: row.mime_type,
    content: Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content),
  };
}

export async function getParsedText(id: string): Promise<string | null> {
  const meta = await getResumeMeta(id);
  return meta?.parsed_text ?? null;
}
