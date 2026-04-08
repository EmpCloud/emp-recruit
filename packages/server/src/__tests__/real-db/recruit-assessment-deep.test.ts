// =============================================================================
// RECRUIT ASSESSMENT DEEP — templates, questions, invite, scoring, surveys
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import knexLib, { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

let db: Knex;
const ORG_ID = 5;
const USER_ID = 522;
const TS = Date.now();
const cleanup: { table: string; id: string }[] = [];

beforeAll(async () => {
  db = knexLib({
    client: "mysql2",
    connection: { host: "localhost", port: 3306, user: "empcloud", password: process.env.DB_PASSWORD || "", database: "emp_recruit" },
  });
  await db.raw("SELECT 1");
});

afterEach(async () => {
  for (const item of cleanup.reverse()) {
    try { await db(item.table).where({ id: item.id }).del(); } catch {}
  }
  cleanup.length = 0;
});

afterAll(async () => { if (db) await db.destroy(); });

async function seedCandidate(): Promise<string> {
  const id = uuidv4();
  await db("candidates").insert({
    id, organization_id: ORG_ID, first_name: `Assess-${TS}`, last_name: "Test",
    email: `assess-${TS}@test.com`, source: "direct",
  });
  cleanup.push({ table: "candidates", id });
  return id;
}

// ==========================================================================
// ASSESSMENT TEMPLATES
// ==========================================================================
describe("Assessment Templates", () => {
  it("should create a technical assessment template with questions", async () => {
    const id = uuidv4();
    const questions = [
      { text: "What is Big O notation?", type: "text", points: 10 },
      { text: "Which is O(1)?", type: "mcq", options: ["Array access", "Binary search"], correct: 0, points: 5 },
      { text: "Explain REST", type: "text", points: 15 },
    ];
    await db("assessment_templates").insert({
      id, organization_id: ORG_ID, name: `Tech-${TS}`,
      description: "Technical screening assessment",
      assessment_type: "technical", time_limit_minutes: 30,
      questions: JSON.stringify(questions), is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id });

    const row = await db("assessment_templates").where({ id }).first();
    expect(row.assessment_type).toBe("technical");
    const qs = typeof row.questions === "string" ? JSON.parse(row.questions) : row.questions;
    expect(qs.length).toBe(3);
    expect(qs[0].text).toBe("What is Big O notation?");
  });

  it("should create a coding assessment template", async () => {
    const id = uuidv4();
    await db("assessment_templates").insert({
      id, organization_id: ORG_ID, name: `Coding-${TS}`,
      assessment_type: "coding", time_limit_minutes: 60,
      questions: JSON.stringify([{ text: "Reverse a linked list", type: "code", points: 20 }]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id });

    const row = await db("assessment_templates").where({ id }).first();
    expect(row.assessment_type).toBe("coding");
    expect(row.time_limit_minutes).toBe(60);
  });

  it("should update a template", async () => {
    const id = uuidv4();
    await db("assessment_templates").insert({
      id, organization_id: ORG_ID, name: `Old-${TS}`,
      assessment_type: "aptitude", questions: JSON.stringify([]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id });

    await db("assessment_templates").where({ id }).update({
      name: `Updated-${TS}`, time_limit_minutes: 45,
    });

    const row = await db("assessment_templates").where({ id }).first();
    expect(row.name).toBe(`Updated-${TS}`);
    expect(row.time_limit_minutes).toBe(45);
  });

  it("should deactivate a template", async () => {
    const id = uuidv4();
    await db("assessment_templates").insert({
      id, organization_id: ORG_ID, name: `Deact-${TS}`,
      assessment_type: "personality", questions: JSON.stringify([]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id });

    await db("assessment_templates").where({ id }).update({ is_active: false });
    const row = await db("assessment_templates").where({ id }).first();
    expect(row.is_active).toBe(0);
  });
});

// ==========================================================================
// CANDIDATE ASSESSMENTS
// ==========================================================================
describe("Candidate Assessments", () => {
  it("should invite a candidate with unique token", async () => {
    const candId = await seedCandidate();
    const tmplId = uuidv4();
    await db("assessment_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Inv-${TS}`,
      assessment_type: "technical", questions: JSON.stringify([{ text: "Q1", type: "text" }]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id: tmplId });

    const assessId = uuidv4();
    const token = crypto.randomBytes(32).toString("hex");
    await db("candidate_assessments").insert({
      id: assessId, organization_id: ORG_ID, candidate_id: candId,
      template_id: tmplId, status: "invited", token,
    });
    cleanup.push({ table: "candidate_assessments", id: assessId });

    const row = await db("candidate_assessments").where({ id: assessId }).first();
    expect(row.status).toBe("invited");
    expect(row.token.length).toBe(64);
  });

  it("should start an assessment", async () => {
    const candId = await seedCandidate();
    const tmplId = uuidv4();
    await db("assessment_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Start-${TS}`,
      assessment_type: "technical", questions: JSON.stringify([]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id: tmplId });

    const assessId = uuidv4();
    await db("candidate_assessments").insert({
      id: assessId, organization_id: ORG_ID, candidate_id: candId,
      template_id: tmplId, status: "invited", token: crypto.randomBytes(32).toString("hex"),
    });
    cleanup.push({ table: "candidate_assessments", id: assessId });

    await db("candidate_assessments").where({ id: assessId }).update({
      status: "in_progress", started_at: new Date(),
    });

    const row = await db("candidate_assessments").where({ id: assessId }).first();
    expect(row.status).toBe("in_progress");
    expect(row.started_at).toBeTruthy();
  });

  it("should submit responses and compute score", async () => {
    const candId = await seedCandidate();
    const tmplId = uuidv4();
    await db("assessment_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Score-${TS}`,
      assessment_type: "technical",
      questions: JSON.stringify([
        { text: "2+2?", type: "mcq", options: ["3", "4", "5"], correct: 1, points: 10 },
        { text: "Capital of India?", type: "mcq", options: ["Mumbai", "Delhi", "Bangalore"], correct: 1, points: 10 },
      ]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id: tmplId });

    const assessId = uuidv4();
    await db("candidate_assessments").insert({
      id: assessId, organization_id: ORG_ID, candidate_id: candId,
      template_id: tmplId, status: "in_progress", token: crypto.randomBytes(32).toString("hex"),
      started_at: new Date(),
    });
    cleanup.push({ table: "candidate_assessments", id: assessId });

    // Submit responses
    const r1 = uuidv4();
    const r2 = uuidv4();
    await db("assessment_responses").insert([
      { id: r1, assessment_id: assessId, organization_id: ORG_ID, question_index: 0, answer: "4", is_correct: true, time_taken_seconds: 15 },
      { id: r2, assessment_id: assessId, organization_id: ORG_ID, question_index: 1, answer: "Mumbai", is_correct: false, time_taken_seconds: 20 },
    ]);
    cleanup.push({ table: "assessment_responses", id: r1 });
    cleanup.push({ table: "assessment_responses", id: r2 });

    // Compute score
    const responses = await db("assessment_responses").where({ assessment_id: assessId });
    const score = responses.filter((r: any) => r.is_correct).length * 10;
    const maxScore = 20;

    await db("candidate_assessments").where({ id: assessId }).update({
      status: "completed", completed_at: new Date(), score, max_score: maxScore,
      percentile: 50.0,
    });

    const row = await db("candidate_assessments").where({ id: assessId }).first();
    expect(row.status).toBe("completed");
    expect(row.score).toBe(10);
    expect(row.max_score).toBe(20);
  });

  it("should expire an assessment", async () => {
    const candId = await seedCandidate();
    const tmplId = uuidv4();
    await db("assessment_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Expire-${TS}`,
      assessment_type: "aptitude", questions: JSON.stringify([]),
      is_active: true,
    });
    cleanup.push({ table: "assessment_templates", id: tmplId });

    const assessId = uuidv4();
    await db("candidate_assessments").insert({
      id: assessId, organization_id: ORG_ID, candidate_id: candId,
      template_id: tmplId, status: "expired", token: crypto.randomBytes(32).toString("hex"),
    });
    cleanup.push({ table: "candidate_assessments", id: assessId });

    const row = await db("candidate_assessments").where({ id: assessId }).first();
    expect(row.status).toBe("expired");
  });
});

// ==========================================================================
// CANDIDATE SURVEYS
// ==========================================================================
describe("Candidate Surveys", () => {
  it("should create and complete a candidate experience survey", async () => {
    const candId = await seedCandidate();
    const jobId = uuidv4();
    await db("job_postings").insert({
      id: jobId, organization_id: ORG_ID, title: `Survey-Job-${TS}`, slug: `survey-job-${jobId}`,
      description: "Test survey job", status: "published", created_by: USER_ID, employment_type: "full_time",
    });
    cleanup.push({ table: "job_postings", id: jobId });

    const appId = uuidv4();
    await db("applications").insert({
      id: appId, organization_id: ORG_ID, job_id: jobId, candidate_id: candId,
      stage: "interview",
    });
    cleanup.push({ table: "applications", id: appId });

    const surveyId = uuidv4();
    const token = crypto.randomBytes(32).toString("hex");
    await db("candidate_surveys").insert({
      id: surveyId, organization_id: ORG_ID, candidate_id: candId,
      application_id: appId, survey_type: "experience", status: "sent", token,
    });
    cleanup.push({ table: "candidate_surveys", id: surveyId });

    // Submit responses
    const resp1 = uuidv4();
    const resp2 = uuidv4();
    await db("candidate_survey_responses").insert([
      { id: resp1, survey_id: surveyId, organization_id: ORG_ID, question_key: "overall_experience", rating: 4 },
      { id: resp2, survey_id: surveyId, organization_id: ORG_ID, question_key: "communication", text_response: "Very responsive" },
    ]);
    cleanup.push({ table: "candidate_survey_responses", id: resp1 });
    cleanup.push({ table: "candidate_survey_responses", id: resp2 });

    await db("candidate_surveys").where({ id: surveyId }).update({
      status: "completed", completed_at: new Date(),
    });

    const survey = await db("candidate_surveys").where({ id: surveyId }).first();
    expect(survey.status).toBe("completed");
    const responses = await db("candidate_survey_responses").where({ survey_id: surveyId });
    expect(responses.length).toBe(2);
  });
});

// ==========================================================================
// CANDIDATE SCORES (Resume Scoring)
// ==========================================================================
describe("Candidate Scores", () => {
  it("should store resume scoring result", async () => {
    const candId = await seedCandidate();
    const jobId = uuidv4();
    await db("job_postings").insert({
      id: jobId, organization_id: ORG_ID, title: `Score-Job-${TS}`, slug: `score-job-${jobId}`,
      description: "Test score job", status: "published", created_by: USER_ID, employment_type: "full_time",
    });
    cleanup.push({ table: "job_postings", id: jobId });

    const appId = uuidv4();
    await db("applications").insert({
      id: appId, organization_id: ORG_ID, job_id: jobId, candidate_id: candId,
      stage: "screening",
    });
    cleanup.push({ table: "applications", id: appId });

    const scoreId = uuidv4();
    await db("candidate_scores").insert({
      id: scoreId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      overall_score: 85, skills_score: 90, experience_score: 80,
      matched_skills: JSON.stringify(["TypeScript", "React", "Node.js"]),
      missing_skills: JSON.stringify(["Kubernetes"]),
      recommendation: "strong_match", scored_at: new Date(),
    });
    cleanup.push({ table: "candidate_scores", id: scoreId });

    const row = await db("candidate_scores").where({ id: scoreId }).first();
    expect(row.overall_score).toBe(85);
    expect(row.recommendation).toBe("strong_match");
    const matched = typeof row.matched_skills === "string" ? JSON.parse(row.matched_skills) : row.matched_skills;
    expect(matched).toContain("TypeScript");
  });
});

// ==========================================================================
// BACKGROUND CHECKS
// ==========================================================================
describe("Background Checks", () => {
  it("should initiate a background check", async () => {
    const candId = await seedCandidate();
    const bgId = uuidv4();
    await db("background_checks").insert({
      id: bgId, organization_id: ORG_ID, candidate_id: candId,
      provider: "internal", check_type: "criminal",
      status: "pending", initiated_by: USER_ID,
    });
    cleanup.push({ table: "background_checks", id: bgId });

    const row = await db("background_checks").where({ id: bgId }).first();
    expect(row.status).toBe("pending");
    expect(row.check_type).toBe("criminal");
  });

  it("should complete a background check with result", async () => {
    const candId = await seedCandidate();
    const bgId = uuidv4();
    await db("background_checks").insert({
      id: bgId, organization_id: ORG_ID, candidate_id: candId,
      provider: "third_party", check_type: "employment",
      status: "pending", initiated_by: USER_ID,
    });
    cleanup.push({ table: "background_checks", id: bgId });

    await db("background_checks").where({ id: bgId }).update({
      status: "completed", result: "clear",
      result_details: JSON.stringify({ verified_companies: 2 }),
      completed_at: new Date(),
    });

    const row = await db("background_checks").where({ id: bgId }).first();
    expect(row.status).toBe("completed");
    expect(row.result).toBe("clear");
  });

  it("should create a background check package", async () => {
    const pkgId = uuidv4();
    await db("background_check_packages").insert({
      id: pkgId, organization_id: ORG_ID, name: `Standard-${TS}`,
      description: "Standard verification", provider: "internal",
      checks_included: JSON.stringify(["criminal", "employment", "education"]),
      estimated_days: 7, cost: 500000, is_default: true, is_active: true,
    });
    cleanup.push({ table: "background_check_packages", id: pkgId });

    const row = await db("background_check_packages").where({ id: pkgId }).first();
    const checks = typeof row.checks_included === "string" ? JSON.parse(row.checks_included) : row.checks_included;
    expect(checks).toContain("employment");
    expect(row.estimated_days).toBe(7);
  });
});
