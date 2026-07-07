// ============================================================================
// CANDIDATE AI SERVICE
//
// AI-powered resume parsing + candidate scoring via Claude (Anthropic).
// Called async after an application is submitted. Uses plain fetch (no SDK),
// mirroring the existing job-description generator. Degrades gracefully to a
// heuristic score when ANTHROPIC_API_KEY is not configured.
//
// Writes results into `candidate_scores` (existing table, migration 003) so the
// recruiter UI shows an AI match score + rationale per application.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";
import { getResumeContent } from "./resume-store.service";
import { extractResumeText } from "./resume-parse.util";
import { callLLM, isAiConfigured, activeProviderLabel, friendlyAiError, AiUnavailableError } from "../ai/ai-provider.service";

export interface AiResumeResult {
  overallScore: number; // 0-100
  skillsScore: number;
  experienceScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  summary: string;
  skillsReasoning?: string;
  experienceReasoning?: string;
  strengths?: string[];
  concerns?: string[];
  extracted: {
    name?: string;
    email?: string;
    phone?: string;
    total_experience_years?: number;
    current_title?: string;
    current_company?: string;
    skills?: string[];
    education?: string[];
  };
  usedAI: boolean;
}

// ---------------------------------------------------------------------------
// Public: parse + score a resume against a job (structured result).
// Uses whatever LLM the operator configured (OpenAI / Anthropic / Gemini /
// OpenAI-compatible) via ai-provider.service; falls back to the deterministic
// heuristic when no key is set OR the API call fails.
// ---------------------------------------------------------------------------
export async function parseAndScore(
  resumeText: string,
  job: {
    title: string;
    description?: string;
    requirements?: string;
    skills?: string[];
  },
  opts: { requireAI?: boolean } = {},
): Promise<AiResumeResult> {
  const text = (resumeText || "").slice(0, 24_000); // token budget guard
  if (isAiConfigured() && text.trim().length > 40) {
    try {
      return await scoreWithLLM(text, job);
    } catch (err) {
      const msg = (err as Error).message;
      // requireAI: caller wants a genuine AI result — surface a CLEAN, user-safe
      // failure (e.g. "AI is busy") instead of a misleading keyword score.
      logger.warn(`AI scoring (${activeProviderLabel()}) failed: ${msg}`);
      if (opts.requireAI) {
        throw friendlyAiError(err);
      }
    }
  } else if (opts.requireAI && isAiConfigured()) {
    // Configured but the resume text was too short to score with AI.
    throw new AiUnavailableError("There isn't enough resume text to run an AI evaluation.", 422);
  }
  return heuristicScore(text, job);
}

// ---------------------------------------------------------------------------
// Background hook: called fire-and-forget after an application is created.
// Loads the resume text, scores it vs the job, and upserts candidate_scores.
// ---------------------------------------------------------------------------
export async function scoreApplicationInBackground(applicationId: string): Promise<void> {
  const knex = getDB().knex();
  const app = await knex("applications as a")
    .join("job_postings as j", "a.job_id", "j.id")
    .where("a.id", applicationId)
    .select(
      "a.id as application_id",
      "a.candidate_id",
      "a.job_id",
      "a.organization_id",
      "a.resume_file_id",
      "j.title",
      "j.description",
      "j.requirements",
      "j.skills",
    )
    .first();
  if (!app) return;

  const resumeText = await loadResumeText(app.resume_file_id);
  let jobSkills: string[] = [];
  try {
    jobSkills = typeof app.skills === "string" ? JSON.parse(app.skills) : app.skills || [];
  } catch {
    jobSkills = [];
  }

  const result = await parseAndScore(resumeText, {
    title: app.title,
    description: app.description,
    requirements: app.requirements,
    skills: jobSkills,
  });

  // Upsert into candidate_scores (existing schema, migration 003).
  const existing = await knex("candidate_scores")
    .where({ application_id: applicationId })
    .first();
  const row = {
    organization_id: app.organization_id,
    application_id: applicationId,
    candidate_id: app.candidate_id,
    job_id: app.job_id,
    overall_score: result.overallScore,
    skills_score: result.skillsScore,
    experience_score: result.experienceScore,
    matched_skills: JSON.stringify(result.matchedSkills),
    missing_skills: JSON.stringify(result.missingSkills),
    recommendation: recommendationFor(result.overallScore),
    ai_summary: result.summary || null,
    scored_at: new Date(),
    updated_at: new Date(),
  };
  if (existing) {
    await knex("candidate_scores").where({ id: existing.id }).update(row);
  } else {
    await knex("candidate_scores").insert({ id: uuidv4(), created_at: new Date(), ...row });
  }
  logger.info(
    `AI score for application ${applicationId}: ${result.overallScore} (${result.usedAI ? "ai" : "heuristic"})`,
  );
}

// ---------------------------------------------------------------------------
// Load resume text from the MySQL BLOB and extract it fresh with the real
// parser (pdf-parse / mammoth). We do NOT trust any stored parsed_text because
// earlier uploads persisted binary garbage from the old regex extractor.
// ---------------------------------------------------------------------------
export async function loadResumeText(resumeFileId: string | null | undefined): Promise<string> {
  if (!resumeFileId) return "";
  try {
    const { content, mimeType } = await getResumeContent(resumeFileId);
    return await extractResumeText(content, mimeType);
  } catch (err) {
    logger.warn(`Could not load/parse resume ${resumeFileId}: ${(err as Error).message}`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// LLM call (provider-agnostic)
// ---------------------------------------------------------------------------
async function scoreWithLLM(resumeText: string, job: {
  title: string;
  description?: string;
  requirements?: string;
  skills?: string[];
}): Promise<AiResumeResult> {
  const prompt = buildPrompt(resumeText, job);
  // Reasoning models (e.g. Nemotron) spend tokens thinking before the JSON, so
  // give generous headroom or the JSON gets truncated mid-object.
  const textOut = await callLLM(prompt, { maxTokens: 3000, temperature: 0.2, json: true });
  const parsed = extractJson(textOut);
  if (!parsed) throw new Error("LLM returned no parseable JSON");

  return {
    overallScore: clamp(parsed.overall_score),
    skillsScore: clamp(parsed.skills_score),
    experienceScore: clamp(parsed.experience_score),
    matchedSkills: arr(parsed.matched_skills),
    missingSkills: arr(parsed.missing_skills),
    summary: String(parsed.summary || "").slice(0, 1000),
    skillsReasoning: parsed.skills_reasoning ? String(parsed.skills_reasoning).slice(0, 600) : undefined,
    experienceReasoning: parsed.experience_reasoning ? String(parsed.experience_reasoning).slice(0, 600) : undefined,
    strengths: arr(parsed.strengths),
    concerns: arr(parsed.concerns),
    extracted: parsed.extracted || {},
    usedAI: true,
  };
}

function buildPrompt(resumeText: string, job: {
  title: string;
  description?: string;
  requirements?: string;
  skills?: string[];
}): string {
  return `You are an expert technical recruiter. Evaluate this candidate's resume against the job. Be specific and evidence-based: justify every score by pointing to what IS and ISN'T in the resume. Infer related skills sensibly (e.g. a "Node.js developer" almost certainly knows JavaScript) but never invent experience the resume doesn't support.

JOB TITLE: ${job.title}
JOB DESCRIPTION: ${(job.description || "").slice(0, 4000)}
REQUIREMENTS: ${(job.requirements || "").slice(0, 2000)}
REQUIRED SKILLS: ${(job.skills || []).join(", ") || "(not specified)"}

RESUME:
${resumeText}

Respond with ONLY a JSON object (no prose, no markdown fences) of this exact shape:
{
  "overall_score": <0-100 integer, holistic fit>,
  "skills_score": <0-100 integer, skills match>,
  "experience_score": <0-100 integer, experience/seniority fit>,
  "matched_skills": [<required skills the candidate clearly has, inferring related ones>],
  "missing_skills": [<required skills genuinely absent from the resume>],
  "summary": "<2-3 sentence overall recruiter-facing verdict>",
  "skills_reasoning": "<1-2 sentences: WHY the skills score — which required skills are present/inferred vs missing>",
  "experience_reasoning": "<1-2 sentences: WHY the experience score — years, seniority, domain fit vs the role's needs>",
  "strengths": [<3-5 concrete strengths for THIS role, each a short phrase>],
  "concerns": [<2-5 concrete gaps/risks that lowered the score, each a short phrase>],
  "extracted": {
    "name": "", "email": "", "phone": "",
    "total_experience_years": <number>,
    "current_title": "", "current_company": "",
    "skills": [<all skills detected>],
    "education": [<degrees/institutions>]
  }
}`;
}

// ---------------------------------------------------------------------------
// Heuristic fallback (no API key) — keyword/skill overlap. Deterministic.
// ---------------------------------------------------------------------------
// Normalize a skill/word for fuzzy comparison: lowercase, drop punctuation &
// common noise words, so "Node.js" ~ "nodejs" ~ "node js", "REST APIs" ~ "rest api".
function normalizeSkill(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")             // drop parentheticals: "GCP (Google...)" → "gcp"
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\bapis?\b/g, "api")          // apis → api
    .replace(/\.js\b/g, "js")              // node.js → nodejs
    .replace(/\s+/g, " ")
    .trim();
}

// Word-boundary containment: `needle` must appear as a whole token in `hay`
// (which is space-separated normalized text). Prevents "rest" matching
// "interests" or "git" matching "digit".
function hasWord(hay: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(hay);
}

// Does the resume text evidence this required skill? Matches on the normalized
// skill AND its significant tokens, so "Google Cloud Platform (GCP)" hits on
// "gcp" or "google cloud", and "REST APIs" hits on "rest api".
function resumeHasSkill(normText: string, compactText: string, skill: string): boolean {
  const norm = normalizeSkill(skill);
  if (!norm) return false;

  // Multi-word phrase: match the phrase as whole words, or (for distinctive
  // multi-token skills) require most tokens to be present as whole words.
  if (norm.includes(" ")) {
    if (hasWord(normText, norm)) return true;
    const compactSkill = norm.replace(/\s+/g, "");
    if (compactSkill.length >= 5 && compactText.includes(compactSkill)) return true;
    const tokens = norm.split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
    if (tokens.length >= 2) {
      const hits = tokens.filter((t) => hasWord(normText, t)).length;
      return hits / tokens.length >= 0.75;
    }
    return false;
  }

  // Single token: whole-word match (short ones like "aws", "sql", "git" must not
  // substring-match inside bigger words). Also allow a compact form for the
  // ".js" family (nodejs, expressjs).
  if (hasWord(normText, norm)) return true;
  if (norm.length >= 5 && compactText.includes(norm)) return true; // e.g. "nodejs"
  return false;
}

const STOPWORDS = new Set(["and", "the", "for", "with", "based", "api", "platform"]);

function heuristicScore(resumeText: string, job: {
  title: string;
  requirements?: string;
  skills?: string[];
}): AiResumeResult {
  const raw = resumeText || "";
  const normText = normalizeSkill(raw);              // punctuation-collapsed, spaced
  const compactText = normText.replace(/\s+/g, "");  // spaces removed for "nodejs" matches

  const requiredOriginal = (job.skills && job.skills.length
    ? job.skills
    : tokenize(`${job.title} ${job.requirements || ""}`)
  ).filter((s) => s && s.length > 1);
  const seen = new Set<string>();
  const uniqReq = requiredOriginal.filter((s) => {
    const k = normalizeSkill(s);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of uniqReq) {
    if (resumeHasSkill(normText, compactText, skill)) matched.push(skill);
    else missing.push(skill);
  }
  const skillsScore = uniqReq.length ? Math.round((matched.length / uniqReq.length) * 100) : 50;

  // Experience: take the largest "N years" figure mentioned.
  const years = Math.max(
    0,
    ...[...raw.matchAll(/(\d+)\+?\s*(?:years?|yrs?)/gi)].map((m) => Number(m[1])).filter((n) => n < 60),
  );
  const experienceScore = Math.min(100, 40 + years * 12);

  const overall = Math.round(skillsScore * 0.6 + experienceScore * 0.4);
  return {
    overallScore: overall,
    skillsScore,
    experienceScore,
    matchedSkills: matched,
    missingSkills: missing,
    summary: `Keyword match: ${matched.length}/${uniqReq.length} required skills found in the resume${years ? `, ~${years} yrs experience detected` : ""}. (Set an AI provider key in .env for a full AI evaluation.)`,
    extracted: { skills: matched, total_experience_years: years },
    usedAI: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(n: any): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}
function recommendationFor(score: number): "strong_match" | "good_match" | "partial_match" | "weak_match" {
  if (score >= 80) return "strong_match";
  if (score >= 60) return "good_match";
  if (score >= 40) return "partial_match";
  return "weak_match";
}
function arr(v: any): string[] {
  return Array.isArray(v) ? v.map(String).slice(0, 40) : [];
}
function tokenize(s: string): string[] {
  return String(s).split(/[^a-zA-Z0-9+#.]+/).filter((w) => w.length > 2);
}
// Robustly pull a JSON object out of an LLM response. Reasoning models often
// wrap the answer in prose, markdown fences, or emit multiple brace-laden
// snippets, so naive "first { to last }" fails. We: (1) try fenced ```json
// blocks, (2) scan for balanced-brace objects and parse the LAST one that
// validates and looks like a score object.
function extractJson(text: string): any | null {
  if (!text) return null;

  const candidates: string[] = [];

  // 1) Fenced code blocks ```json ... ``` or ``` ... ```
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) candidates.push(m[1]);

  // 2) Balanced-brace scan across the whole text (handles nested objects).
  let depth = 0, startIdx = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") { if (depth === 0) startIdx = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && startIdx !== -1) { candidates.push(text.slice(startIdx, i + 1)); startIdx = -1; }
    }
  }

  // 3) Fallback: first { to last }.
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e > s) candidates.push(text.slice(s, e + 1));

  // Parse candidates; prefer ones that carry a score field (the real answer).
  let best: any = null;
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") {
        if ("overall_score" in parsed || "skills_score" in parsed) return parsed;
        best = best ?? parsed;
      }
    } catch {
      /* try next */
    }
  }
  return best;
}
