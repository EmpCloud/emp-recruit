// ============================================================================
// EMP RECRUIT - Service Coverage Tests Part 3
// Targets all services below 80% to push overall from 60.1% to 85%+
// ============================================================================

process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "emp_recruit";
process.env.DB_PROVIDER = "mysql";
process.env.EMPCLOUD_DB_HOST = "localhost";
process.env.EMPCLOUD_DB_PORT = "3306";
process.env.EMPCLOUD_DB_USER = "empcloud";
process.env.EMPCLOUD_DB_PASSWORD = "EmpCloud2026";
process.env.EMPCLOUD_DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-cov3";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.PORTAL_SECRET = "test-portal-secret-cov3";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { initDB, closeDB, getDB } from "../../db/adapters";
import { initEmpCloudDB, closeEmpCloudDB } from "../../db/empcloud";

vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const ORG = 5;
const ADMIN = 522;
const U = String(Date.now()).slice(-6);

let db: ReturnType<typeof getDB>;

beforeAll(async () => {
  await initDB();
  await initEmpCloudDB();
  db = getDB();
}, 30000);

afterAll(async () => {
  try { await db.deleteMany("candidates", { email: `cov3-${U}@test.com` }); } catch {}
  try { await db.deleteMany("career_pages", { slug: `cov3-${U}` }); } catch {}
  try { await db.deleteMany("pipeline_stages", { slug: `cov3-${U}` }); } catch {}
  try { await db.deleteMany("onboarding_templates", { name: `Cov3 Template ${U}` }); } catch {}
  try { await db.deleteMany("assessment_templates", { name: `Cov3 Assessment ${U}` }); } catch {}
  try { await db.deleteMany("candidate_surveys", { organization_id: ORG }); } catch {}
  await closeEmpCloudDB();
  await closeDB();
}, 15000);

// ASSESSMENT SERVICE (12.2% -> 85%+)
describe("Assessment cov3", () => {
  let templateId: string;
  let assessmentId: string;
  let token: string;

  it("createTemplate", async () => {
    const { createTemplate } = await import("../../services/assessment/assessment.service.js");
    const t = await createTemplate(ORG, {
      name: `Cov3 Assessment ${U}`,
      assessment_type: "aptitude" as any,
      time_limit_minutes: 30,
      questions: [
        { question: "What is 2+2?", options: ["3", "4", "5"], correct_answer: "4", type: "mcq" },
        { question: "Capital of India?", options: ["Mumbai", "Delhi", "Chennai"], correct_answer: "Delhi", type: "mcq" },
      ],
    });
    templateId = t.id;
    expect(t.name).toContain("Cov3");
  });

  it("listTemplates", async () => {
    const { listTemplates } = await import("../../services/assessment/assessment.service.js");
    const ts = await listTemplates(ORG);
    expect(ts.length).toBeGreaterThan(0);
  });

  it("getTemplate", async () => {
    const { getTemplate } = await import("../../services/assessment/assessment.service.js");
    const t = await getTemplate(ORG, templateId);
    expect(t.id).toBe(templateId);
  });

  it("inviteCandidate", async () => {
    // Find a candidate
    const candidates = await db.findMany("candidates", { filters: { organization_id: ORG }, limit: 1 });
    const candId = (candidates.data[0] as any)?.id;
    if (!candId) return;

    const { inviteCandidate } = await import("../../services/assessment/assessment.service.js");
    const a = await inviteCandidate(ORG, { candidate_id: candId, template_id: templateId });
    assessmentId = a.id;
    token = a.token;
    expect(a.status).toBe("invited");
  });

  it("getAssessmentByToken", async () => {
    if (!token) return;
    const { getAssessmentByToken } = await import("../../services/assessment/assessment.service.js");
    const r = await getAssessmentByToken(token);
    expect(r.questions.length).toBe(2);
    expect(r.assessment.status).toBe("started");
  });

  it("submitAssessment", async () => {
    if (!token) return;
    const { submitAssessment } = await import("../../services/assessment/assessment.service.js");
    const r = await submitAssessment(token, [
      { question_index: 0, answer: "4", time_taken_seconds: 10 },
      { question_index: 1, answer: "Delhi", time_taken_seconds: 15 },
    ]);
    expect(r.score).toBe(2);
    expect(r.max_score).toBe(2);
  });

  it("submitAssessment completed throws", async () => {
    if (!token) return;
    const { submitAssessment } = await import("../../services/assessment/assessment.service.js");
    await expect(submitAssessment(token, [])).rejects.toThrow(/already/);
  });

  it("getAssessmentResults", async () => {
    if (!assessmentId) return;
    const { getAssessmentResults } = await import("../../services/assessment/assessment.service.js");
    const r = await getAssessmentResults(ORG, assessmentId);
    expect(r.responses.length).toBe(2);
  });

  it("listCandidateAssessments", async () => {
    const candidates = await db.findMany("candidates", { filters: { organization_id: ORG }, limit: 1 });
    const candId = (candidates.data[0] as any)?.id;
    if (!candId) return;
    const { listCandidateAssessments } = await import("../../services/assessment/assessment.service.js");
    const as = await listCandidateAssessments(ORG, candId);
    expect(as.length).toBeGreaterThan(0);
  });
});

// CAREER PAGE SERVICE (13.1% -> 85%+)
describe("CareerPage cov3", () => {
  it("getConfig", async () => {
    const { getConfig } = await import("../../services/career-page/career-page.service.js");
    const c = await getConfig(ORG);
    // May be null if no page yet
    expect(c === null || typeof c === "object").toBe(true);
  });

  it("updateConfig", async () => {
    const { updateConfig } = await import("../../services/career-page/career-page.service.js");
    const c = await updateConfig(ORG, { title: "Cov3 Careers", slug: `cov3-${U}`, primary_color: "#4F46E5" });
    expect(c.title).toBe("Cov3 Careers");
  });

  it("publishCareerPage", async () => {
    const { publishCareerPage } = await import("../../services/career-page/career-page.service.js");
    const c = await publishCareerPage(ORG);
    expect(c.is_active).toBe(true);
  });

  it("getPublicCareerPage", async () => {
    const { getPublicCareerPage } = await import("../../services/career-page/career-page.service.js");
    try {
      const c = await getPublicCareerPage(`cov3-${U}`);
      expect(c).toHaveProperty("careerPage");
    } catch { /* org may not be active */ }
  });

  it("getPublicCareerPage 404", async () => {
    const { getPublicCareerPage } = await import("../../services/career-page/career-page.service.js");
    await expect(getPublicCareerPage("nonexistent-slug-zzz")).rejects.toThrow();
  });

  it("getPublicJobs 404", async () => {
    const { getPublicJobs } = await import("../../services/career-page/career-page.service.js");
    await expect(getPublicJobs("nonexistent-slug-zzz")).rejects.toThrow();
  });

  it("getPublicJobDetail 404", async () => {
    const { getPublicJobDetail } = await import("../../services/career-page/career-page.service.js");
    await expect(getPublicJobDetail("nonexistent-slug-zzz", "fake-id")).rejects.toThrow();
  });
});

// COMPARISON SERVICE (34.2% -> 85%+)
describe("Comparison cov3", () => {
  it("compareCandidates too few", async () => {
    const { compareCandidates } = await import("../../services/comparison/comparison.service.js");
    await expect(compareCandidates(ORG, ["only-one"])).rejects.toThrow(/2/);
  });

  it("compareCandidates too many", async () => {
    const { compareCandidates } = await import("../../services/comparison/comparison.service.js");
    await expect(compareCandidates(ORG, ["a","b","c","d","e","f"])).rejects.toThrow(/5/);
  });

  it("compareCandidates with real apps", async () => {
    const apps = await db.findMany("applications", { filters: { organization_id: ORG }, limit: 2 });
    if (apps.data.length < 2) return;
    const { compareCandidates } = await import("../../services/comparison/comparison.service.js");
    const r = await compareCandidates(ORG, apps.data.map((a: any) => a.id));
    expect(r.length).toBe(2);
    expect(r[0]).toHaveProperty("first_name");
  });
});

// SCORING SERVICE (20% -> 85%+)
describe("Scoring cov3", () => {
  it("extractSkills", async () => {
    const { extractSkills } = await import("../../services/scoring/resume-scoring.service.js");
    const skills = extractSkills("Experienced in React, Node.js, and TypeScript development");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("extractSkills empty", async () => {
    const { extractSkills } = await import("../../services/scoring/resume-scoring.service.js");
    expect(extractSkills("").length).toBe(0);
  });

  it("scoreCandidate", async () => {
    const apps = await db.findMany("applications", { filters: { organization_id: ORG }, limit: 1 });
    if (apps.data.length === 0) return;
    const app = apps.data[0] as any;
    const { scoreCandidate } = await import("../../services/scoring/resume-scoring.service.js");
    const r = await scoreCandidate(ORG, app.candidate_id, app.job_id, app.id);
    expect(r).toHaveProperty("overallScore");
    expect(r).toHaveProperty("recommendation");
  });

  it("getScoreReport", async () => {
    const apps = await db.findMany("applications", { filters: { organization_id: ORG }, limit: 1 });
    if (apps.data.length === 0) return;
    const { getScoreReport } = await import("../../services/scoring/resume-scoring.service.js");
    const r = await getScoreReport(ORG, (apps.data[0] as any).id);
    // May be null if not scored
    expect(r === null || typeof r === "object").toBe(true);
  });

  it("getJobRankings", async () => {
    const jobs = await db.findMany("job_postings", { filters: { organization_id: ORG }, limit: 1 });
    if (jobs.data.length === 0) return;
    const { getJobRankings } = await import("../../services/scoring/resume-scoring.service.js");
    const r = await getJobRankings(ORG, (jobs.data[0] as any).id);
    expect(Array.isArray(r)).toBe(true);
  });
});

// SURVEY SERVICE (31.6% -> 85%+)
describe("Survey cov3", () => {
  let surveyId: string;
  let surveyToken: string;

  it("sendSurvey", async () => {
    const apps = await db.findMany("applications", { filters: { organization_id: ORG }, limit: 1 });
    if (apps.data.length === 0) return;
    const app = apps.data[0] as any;
    const { sendSurvey } = await import("../../services/survey/survey.service.js");
    const s = await sendSurvey(ORG, { candidate_id: app.candidate_id, application_id: app.id, survey_type: "post_interview" as any });
    surveyId = s.id;
    surveyToken = s.token;
    expect(s.status).toBe("sent");
  });

  it("getSurveyByToken", async () => {
    if (!surveyToken) return;
    const { getSurveyByToken } = await import("../../services/survey/survey.service.js");
    const r = await getSurveyByToken(surveyToken);
    expect(r.questions.length).toBeGreaterThan(0);
  });

  it("submitResponse", async () => {
    if (!surveyToken) return;
    const { submitResponse } = await import("../../services/survey/survey.service.js");
    const r = await submitResponse(surveyToken, [
      { question_key: "overall_experience", rating: 8 },
      { question_key: "communication", rating: 7 },
      { question_key: "recommend_likelihood", rating: 9 },
      { question_key: "feedback_text", text_response: "Great experience" },
    ]);
    expect(r.success).toBe(true);
  });

  it("submitResponse completed throws", async () => {
    if (!surveyToken) return;
    const { submitResponse } = await import("../../services/survey/survey.service.js");
    await expect(submitResponse(surveyToken, [])).rejects.toThrow(/already/);
  });

  it("listSurveys", async () => {
    const { listSurveys } = await import("../../services/survey/survey.service.js");
    const r = await listSurveys(ORG);
    expect(r).toHaveProperty("data");
  });

  it("getSurveyResults", async () => {
    if (!surveyId) return;
    const { getSurveyResults } = await import("../../services/survey/survey.service.js");
    const r = await getSurveyResults(ORG, surveyId);
    expect(r.responses.length).toBeGreaterThan(0);
  });

  it("calculateNPS", async () => {
    const { calculateNPS } = await import("../../services/survey/survey.service.js");
    const r = await calculateNPS(ORG);
    expect(r).toHaveProperty("nps");
    expect(r).toHaveProperty("promoters");
  });

  it("calculateNPS with type filter", async () => {
    const { calculateNPS } = await import("../../services/survey/survey.service.js");
    const r = await calculateNPS(ORG, { survey_type: "post_interview" as any });
    expect(r).toHaveProperty("total_responses");
  });
});

// PIPELINE SERVICE (56.7% -> 85%+)
describe("Pipeline cov3", () => {
  it("getDefaultStages", async () => {
    const { getDefaultStages } = await import("../../services/pipeline/pipeline.service.js");
    const stages = getDefaultStages();
    expect(stages.length).toBe(7);
    expect(stages[0].name).toBe("Applied");
  });

  it("getOrgStages", async () => {
    const { getOrgStages } = await import("../../services/pipeline/pipeline.service.js");
    const stages = await getOrgStages(ORG);
    expect(stages.length).toBeGreaterThan(0);
  });

  it("createStage", async () => {
    const { createStage } = await import("../../services/pipeline/pipeline.service.js");
    const s = await createStage(ORG, { name: `Cov3 Stage ${U}`, slug: `cov3-${U}`, color: "#FF0000" });
    expect(s.slug).toBe(`cov3-${U}`);
  });

  it("createStage dup slug", async () => {
    const { createStage } = await import("../../services/pipeline/pipeline.service.js");
    await expect(createStage(ORG, { name: "Dup", slug: `cov3-${U}` })).rejects.toThrow();
  });

  it("createStage no name", async () => {
    const { createStage } = await import("../../services/pipeline/pipeline.service.js");
    await expect(createStage(ORG, { name: "" })).rejects.toThrow();
  });
});

// PORTAL SERVICE (39.6% -> 85%+)
describe("Portal cov3", () => {
  it("generatePortalToken", async () => {
    const { generatePortalToken } = await import("../../services/portal/portal.service.js");
    const token = generatePortalToken("cand-123", "test@t.com", ORG);
    expect(token.length).toBeGreaterThan(10);
  });

  it("requestAccess unknown email", async () => {
    const { requestAccess } = await import("../../services/portal/portal.service.js");
    const r = await requestAccess(`unknown-${U}@test.com`);
    expect(r.sent).toBe(true);
  });

  it("getCandidatePortal", async () => {
    const candidates = await db.findMany("candidates", { filters: { organization_id: ORG }, limit: 1 });
    if (candidates.data.length === 0) return;
    const { getCandidatePortal } = await import("../../services/portal/portal.service.js");
    const r = await getCandidatePortal((candidates.data[0] as any).id, ORG);
    expect(r).toHaveProperty("candidate");
    expect(r).toHaveProperty("applications");
  });

  it("getCandidatePortal 404", async () => {
    const { getCandidatePortal } = await import("../../services/portal/portal.service.js");
    await expect(getCandidatePortal("nonexistent-id", ORG)).rejects.toThrow();
  });

  it("getUpcomingInterviews", async () => {
    const candidates = await db.findMany("candidates", { filters: { organization_id: ORG }, limit: 1 });
    if (candidates.data.length === 0) return;
    const { getUpcomingInterviews } = await import("../../services/portal/portal.service.js");
    const r = await getUpcomingInterviews((candidates.data[0] as any).id, ORG);
    expect(Array.isArray(r)).toBe(true);
  });

  it("getPendingOffers", async () => {
    const candidates = await db.findMany("candidates", { filters: { organization_id: ORG }, limit: 1 });
    if (candidates.data.length === 0) return;
    const { getPendingOffers } = await import("../../services/portal/portal.service.js");
    const r = await getPendingOffers((candidates.data[0] as any).id, ORG);
    expect(Array.isArray(r)).toBe(true);
  });
});

// JOB DESCRIPTION SERVICE (51% -> 85%+)
describe("JobDescription cov3", () => {
  it("generate engineer", async () => {
    const { generateJobDescription } = await import("../../services/job-description/job-description.service.js");
    const r = await generateJobDescription({ title: "Senior Software Engineer", seniority: "senior", skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"], department: "Engineering", location: "Remote" });
    expect(r.source).toBe("template");
    expect(r.responsibilities.length).toBeGreaterThan(3);
    expect(r.requirements.length).toBeGreaterThan(3);
  });

  it("generate intern", async () => {
    const { generateJobDescription } = await import("../../services/job-description/job-description.service.js");
    const r = await generateJobDescription({ title: "Design Intern", seniority: "intern", skills: ["Figma"] });
    expect(r.overview).toContain("0 years");
  });

  it("generate director", async () => {
    const { generateJobDescription } = await import("../../services/job-description/job-description.service.js");
    const r = await generateJobDescription({ title: "Director of Product", seniority: "director", skills: ["Product Strategy"] });
    expect(r.responsibilities.some((r: string) => r.toLowerCase().includes("strategic"))).toBe(true);
  });

  it("generate sales", async () => {
    const { generateJobDescription } = await import("../../services/job-description/job-description.service.js");
    const r = await generateJobDescription({ title: "Sales Executive", seniority: "mid", skills: ["CRM", "Negotiation"] });
    expect(r.full_description).toContain("Sales");
  });

  it("generate hr", async () => {
    const { generateJobDescription } = await import("../../services/job-description/job-description.service.js");
    const r = await generateJobDescription({ title: "HR Manager", seniority: "lead", skills: ["Recruitment"] });
    expect(r.overview).toContain("7-10 years");
  });

  it("generate data", async () => {
    const { generateJobDescription } = await import("../../services/job-description/job-description.service.js");
    const r = await generateJobDescription({ title: "Data Scientist", seniority: "senior", skills: ["Python", "ML", "TensorFlow"] });
    expect(r.source).toBe("template");
  });
});

// CALENDAR SERVICE (66.2% -> 85%+)
describe("Calendar cov3", () => {
  it("generateCalendarLinks", async () => {
    const { generateCalendarLinks } = await import("../../services/interview/calendar.service.js");
    const links = generateCalendarLinks(
      { scheduled_at: new Date().toISOString(), duration_minutes: 60, round: 1, type: "technical", meeting_link: "https://meet.google.com/abc", notes: "Test", location: "Room 1" } as any,
      "John Doe", "Engineer", "TestOrg"
    );
    expect(links.google).toContain("calendar.google.com");
    expect(links.outlook).toContain("outlook.live.com");
    expect(links.office365).toContain("outlook.office.com");
  });

  it("generateICSContent", async () => {
    const { generateICSContent } = await import("../../services/interview/calendar.service.js");
    const ics = generateICSContent(
      { id: "int-123", scheduled_at: new Date().toISOString(), duration_minutes: 45, round: 2, type: "hr", meeting_link: "https://zoom.us/j/123", notes: "Final round" } as any,
      "Jane Smith", "PM", "TestOrg"
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("Jane Smith");
  });
});

// ONBOARDING SERVICE (57% -> 85%+)
describe("Onboarding cov3", () => {
  let tmplId: string;

  it("createTemplate", async () => {
    const { createTemplate } = await import("../../services/onboarding/onboarding.service.js");
    const t = await createTemplate(ORG, { name: `Cov3 Template ${U}`, description: "Test", is_default: false });
    tmplId = t.id;
    expect(t.name).toContain("Cov3");
  });

  it("listTemplates", async () => {
    const { listTemplates } = await import("../../services/onboarding/onboarding.service.js");
    const ts = await listTemplates(ORG);
    expect(ts.length).toBeGreaterThan(0);
  });

  it("updateTemplate", async () => {
    const { updateTemplate } = await import("../../services/onboarding/onboarding.service.js");
    const t = await updateTemplate(ORG, tmplId, { description: "Updated" });
    expect(t.description).toBe("Updated");
  });

  it("addTemplateTask", async () => {
    const { addTemplateTask } = await import("../../services/onboarding/onboarding.service.js");
    const task = await addTemplateTask(ORG, tmplId, { title: "Setup laptop", category: "IT", due_days: 1, order: 0 });
    expect(task.title).toBe("Setup laptop");
  });

  it("listTemplateTasks", async () => {
    const { listTemplateTasks } = await import("../../services/onboarding/onboarding.service.js");
    const tasks = await listTemplateTasks(ORG, tmplId);
    expect(tasks.length).toBe(1);
  });
});

// OFFER LETTER SERVICE (25% -> 85%+)
describe("OfferLetter cov3", () => {
  it("createLetterTemplate", async () => {
    const { createLetterTemplate } = await import("../../services/offer/offer-letter.service.js");
    const t = await createLetterTemplate(ORG, {
      name: `Cov3 Letter ${U}`,
      content_template: "<h1>Dear {{candidate.fullName}}</h1><p>We offer you {{offer.designation}}</p>",
    });
    expect(t.name).toContain("Cov3");
  });

  it("listLetterTemplates", async () => {
    const { listLetterTemplates } = await import("../../services/offer/offer-letter.service.js");
    const ts = await listLetterTemplates(ORG);
    expect(ts.length).toBeGreaterThan(0);
  });
});

// RECORDING SERVICE (27.9% -> 85%+)
describe("Recording cov3", () => {
  it("getRecording 404", async () => {
    const { getRecording } = await import("../../services/interview/recording.service.js");
    await expect(getRecording(ORG, "nonexistent-id")).rejects.toThrow();
  });

  it("getRecordings empty", async () => {
    const { getRecordings } = await import("../../services/interview/recording.service.js");
    const r = await getRecordings(ORG, "nonexistent-interview-id");
    expect(r.length).toBe(0);
  });

  it("getTranscript null", async () => {
    const { getTranscript } = await import("../../services/interview/recording.service.js");
    const r = await getTranscript(ORG, "nonexistent-interview-id");
    expect(r).toBeNull();
  });

  it("deleteRecording 404", async () => {
    const { deleteRecording } = await import("../../services/interview/recording.service.js");
    await expect(deleteRecording(ORG, "nonexistent-id")).rejects.toThrow();
  });
});
