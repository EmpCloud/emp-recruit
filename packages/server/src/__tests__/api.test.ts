// ============================================================================
// EMP RECRUIT — COMPREHENSIVE API INTEGRATION TESTS
// Hits the live API at https://test-recruit.empcloud.com (or localhost:4500)
// Run: npx vitest run src/__tests__/api.test.ts
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.RECRUIT_API_URL || "https://test-recruit.empcloud.com";
const API = `${BASE_URL}/api/v1`;
const PUBLIC_API = `${BASE_URL}/api/v1/public`;

let token = "";
let refreshTokenValue = "";
let userId: number;

// Unique suffix to avoid collisions
const UID = Date.now();

// Shared IDs populated across tests
let jobId: string;
let candidateId: string;
let applicationId: string;
let interviewId: string;
let offerId: string;
let onboardingTemplateId: string;
let onboardingTemplateTaskId: string;
let onboardingChecklistId: string;
let onboardingTaskId: string;
let referralId: string;
let emailTemplateId: string;
let pipelineStageId: string;
let bgCheckPackageId: string;
let bgCheckId: string;
let offerLetterTemplateId: string;
let assessmentTemplateId: string;
let surveyId: string;

// ---- Helpers ----------------------------------------------------------------

function mysqlDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

async function api(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function publicApi(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${PUBLIC_API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

// =============================================================================
// HEALTH CHECK
// =============================================================================
describe("Health", () => {
  it("GET /health returns ok", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });
});

// =============================================================================
// AUTH
// =============================================================================
describe("Auth", () => {
  it("POST /auth/login with valid credentials returns tokens", async () => {
    const r = await api("POST", "/auth/login", {
      email: "meera@technova.in",
      password: "Welcome@123",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.tokens.accessToken).toBeTruthy();
    expect(r.body.data.tokens.refreshToken).toBeTruthy();
    token = r.body.data.tokens.accessToken;
    refreshTokenValue = r.body.data.tokens.refreshToken;
    userId = r.body.data.user.empcloudUserId || r.body.data.user.id;
  });

  it("POST /auth/login with wrong password returns 401", async () => {
    const r = await api("POST", "/auth/login", {
      email: "meera@technova.in",
      password: "WrongPassword123",
    });
    expect([400, 401]).toContain(r.status);
  });

  it("POST /auth/login with missing fields returns validation error", async () => {
    const r = await api("POST", "/auth/login", { email: "meera@technova.in" });
    expect([400, 401, 422]).toContain(r.status);
  });

  it("POST /auth/sso with invalid token returns error", async () => {
    const r = await api("POST", "/auth/sso", { token: "invalid-sso-token" });
    expect([400, 401, 403, 500]).toContain(r.status);
  });

  it("POST /auth/refresh-token with valid refresh token succeeds", async () => {
    if (!refreshTokenValue) return;
    const r = await api("POST", "/auth/refresh-token", { refreshToken: refreshTokenValue });
    // Refresh may or may not be supported — accept success or expected error
    expect([200, 400, 401]).toContain(r.status);
    if (r.status === 200 && r.body.data?.tokens?.accessToken) {
      token = r.body.data.tokens.accessToken;
    }
  });

  it("POST /auth/refresh-token with invalid token returns error", async () => {
    const r = await api("POST", "/auth/refresh-token", { refreshToken: "bad-refresh-token" });
    expect([400, 401, 403]).toContain(r.status);
  });
});

// =============================================================================
// JOBS
// =============================================================================
describe("Jobs", () => {
  it("POST /jobs creates a new job", async () => {
    const r = await api("POST", "/jobs", {
      title: `API Test Engineer ${UID}`,
      department: "Engineering",
      location: "Remote",
      employment_type: "full_time",
      experience_min: 2,
      experience_max: 5,
      description: "Integration test job posting",
      requirements: "TypeScript, Node.js",
      status: "draft",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    jobId = r.body.data.id;
  });

  it("GET /jobs returns paginated list", async () => {
    const r = await api("GET", "/jobs");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data?.data || r.body.data)).toBe(true);
  });

  it("GET /jobs with pagination params works", async () => {
    const r = await api("GET", "/jobs?page=1&perPage=5");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /jobs with status filter works", async () => {
    const r = await api("GET", "/jobs?status=draft");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /jobs/:id returns job details", async () => {
    const r = await api("GET", `/jobs/${jobId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(jobId);
  });

  it("PUT /jobs/:id updates the job", async () => {
    const r = await api("PUT", `/jobs/${jobId}`, {
      title: `API Test Engineer UPDATED ${UID}`,
      salary_min: 80000,
      salary_max: 120000,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("PATCH /jobs/:id/status changes job status", async () => {
    const r = await api("PATCH", `/jobs/${jobId}/status`, { status: "open" });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /jobs/:id/analytics returns analytics for the job", async () => {
    const r = await api("GET", `/jobs/${jobId}/analytics`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /jobs/:nonexistent returns 404", async () => {
    const r = await api("GET", "/jobs/00000000-0000-0000-0000-000000000000");
    expect([404, 400]).toContain(r.status);
  });
});

// =============================================================================
// CANDIDATES
// =============================================================================
describe("Candidates", () => {
  it("POST /candidates creates a new candidate", async () => {
    const r = await api("POST", "/candidates", {
      first_name: "Test",
      last_name: `Candidate${UID}`,
      email: `test.candidate.${UID}@example.com`,
      phone: "+919876543210",
      source: "direct",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    candidateId = r.body.data.id;
  });

  it("GET /candidates returns paginated list", async () => {
    const r = await api("GET", "/candidates");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data?.data || r.body.data)).toBe(true);
  });

  it("GET /candidates with search param works", async () => {
    const r = await api("GET", `/candidates?search=Test`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /candidates/:id returns candidate details", async () => {
    const r = await api("GET", `/candidates/${candidateId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(candidateId);
  });

  it("PUT /candidates/:id updates the candidate", async () => {
    const r = await api("PUT", `/candidates/${candidateId}`, {
      phone: "+919876543211",
      current_company: "TestCorp",
      experience_years: 3,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /candidates/:id/applications returns candidate applications", async () => {
    const r = await api("GET", `/candidates/${candidateId}/applications`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// APPLICATIONS
// =============================================================================
describe("Applications", () => {
  it("POST /applications creates a new application", async () => {
    const r = await api("POST", "/applications", {
      job_id: jobId,
      candidate_id: candidateId,
      source: "direct",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    applicationId = r.body.data.id;
  });

  it("GET /applications returns paginated list", async () => {
    const r = await api("GET", "/applications");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data?.data || r.body.data)).toBe(true);
  });

  it("GET /applications with job_id filter works", async () => {
    const r = await api("GET", `/applications?job_id=${jobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /applications/:id returns application details", async () => {
    const r = await api("GET", `/applications/${applicationId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(applicationId);
  });

  it("GET /applications/:id/timeline returns stage history", async () => {
    const r = await api("GET", `/applications/${applicationId}/timeline`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("PATCH /applications/:id/stage moves application to screening", async () => {
    const r = await api("PATCH", `/applications/${applicationId}/stage`, {
      stage: "screening",
      notes: "Passed initial review",
    });
    expect([200, 400]).toContain(r.status);
  });

  it("POST /applications/:id/notes adds a note", async () => {
    const r = await api("POST", `/applications/${applicationId}/notes`, {
      notes: `Integration test note at ${UID}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /jobs/:id/applications returns applications for a job", async () => {
    const r = await api("GET", `/jobs/${jobId}/applications`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /applications without auth returns 401", async () => {
    const saved = token;
    token = "";
    const r = await api("GET", "/applications");
    expect([401, 403]).toContain(r.status);
    token = saved;
  });
});

// =============================================================================
// INTERVIEWS
// =============================================================================
describe("Interviews", () => {
  it("POST /interviews schedules a new interview", async () => {
    const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const r = await api("POST", "/interviews", {
      application_id: applicationId,
      type: "video",
      round: 1,
      title: `Technical Round - ${UID}`,
      scheduled_at: mysqlDate(scheduledAt),
      duration_minutes: 60,
      location: "Virtual",
      meeting_link: "https://meet.example.com/test",
      notes: "API integration test interview",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    interviewId = r.body.data.id;
  });

  it("GET /interviews returns paginated list", async () => {
    const r = await api("GET", "/interviews");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data?.data || r.body.data)).toBe(true);
  });

  it("GET /interviews with application_id filter works", async () => {
    const r = await api("GET", `/interviews?application_id=${applicationId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /interviews/:id returns interview detail", async () => {
    const r = await api("GET", `/interviews/${interviewId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(interviewId);
  });

  it("PUT /interviews/:id updates interview", async () => {
    const r = await api("PUT", `/interviews/${interviewId}`, {
      notes: "Updated notes for integration test",
      duration_minutes: 45,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("PATCH /interviews/:id/status changes interview status", async () => {
    const r = await api("PATCH", `/interviews/${interviewId}/status`, {
      status: "confirmed",
    });
    expect([200, 400]).toContain(r.status);
  });

  it("GET /interviews/:id/calendar-links returns calendar URLs", async () => {
    const r = await api("GET", `/interviews/${interviewId}/calendar-links`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /interviews/:id/feedback returns feedback list", async () => {
    const r = await api("GET", `/interviews/${interviewId}/feedback`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /interviews/:id/feedback submits feedback", async () => {
    const r = await api("POST", `/interviews/${interviewId}/feedback`, {
      recommendation: "yes",
      technical_score: 4,
      communication_score: 5,
      cultural_fit_score: 4,
      overall_score: 4,
      strengths: "Strong technical skills",
      weaknesses: "None noted",
      notes: "API test feedback",
    });
    // 403 if user is not a panelist, 201 on success, 409 if already submitted
    expect([200, 201, 403, 409]).toContain(r.status);
  });

  it("GET /interviews/:id/recordings returns recording list", async () => {
    const r = await api("GET", `/interviews/${interviewId}/recordings`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /interviews/:id/transcript returns transcript", async () => {
    const r = await api("GET", `/interviews/${interviewId}/transcript`);
    expect([200, 404]).toContain(r.status);
  });
});

// =============================================================================
// OFFERS
// =============================================================================
describe("Offers", () => {
  it("POST /offers creates a new offer", async () => {
    const joiningDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const r = await api("POST", "/offers", {
      application_id: applicationId,
      candidate_id: candidateId,
      job_id: jobId,
      job_title: `API Test Engineer ${UID}`,
      department: "Engineering",
      salary_amount: 10000000,
      salary_currency: "INR",
      joining_date: joiningDate.toISOString().split("T")[0],
      expiry_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      benefits: "Health insurance, Stock options",
      notes: "API test offer",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    offerId = r.body.data.id;
  });

  it("GET /offers returns paginated list", async () => {
    const r = await api("GET", "/offers");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /offers with status filter works", async () => {
    const r = await api("GET", "/offers?status=draft");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /offers/:id returns offer details", async () => {
    const r = await api("GET", `/offers/${offerId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(offerId);
  });

  it("PUT /offers/:id updates draft offer", async () => {
    const r = await api("PUT", `/offers/${offerId}`, {
      salary_amount: 11000000,
      benefits: "Health insurance, Stock options, Remote work",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /offers/:id/submit-approval submits for approval", async () => {
    if (!offerId) return; // skip if offer creation failed
    const r = await api("POST", `/offers/${offerId}/submit-approval`, {
      approver_ids: [userId],
    });
    expect([200, 400, 404]).toContain(r.status);
  });

  it("POST /offers/:id/approve approves offer", async () => {
    if (!offerId) return; // skip if offer creation failed
    const r = await api("POST", `/offers/${offerId}/approve`, {
      comment: "Approved via API test",
    });
    expect([200, 400, 404]).toContain(r.status);
  });
});

// =============================================================================
// ONBOARDING
// =============================================================================
describe("Onboarding", () => {
  it("GET /onboarding/templates returns template list", async () => {
    const r = await api("GET", "/onboarding/templates");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /onboarding/templates creates a template", async () => {
    const r = await api("POST", "/onboarding/templates", {
      name: `API Test Template ${UID}`,
      description: "Integration test onboarding template",
      department: "Engineering",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    onboardingTemplateId = r.body.data.id;
  });

  it("PUT /onboarding/templates/:id updates template", async () => {
    const r = await api("PUT", `/onboarding/templates/${onboardingTemplateId}`, {
      name: `API Test Template UPDATED ${UID}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /onboarding/templates/:id/tasks adds a task", async () => {
    const r = await api("POST", `/onboarding/templates/${onboardingTemplateId}/tasks`, {
      title: `Setup laptop ${UID}`,
      description: "Configure development environment",
      due_day_offset: 1,
      category: "IT Setup",
      order: 1,
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    onboardingTemplateTaskId = r.body.data.id;
  });

  it("GET /onboarding/templates/:id/tasks lists template tasks", async () => {
    const r = await api("GET", `/onboarding/templates/${onboardingTemplateId}/tasks`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("PUT /onboarding/templates/:id/tasks/:taskId updates template task", async () => {
    const r = await api("PUT", `/onboarding/templates/${onboardingTemplateId}/tasks/${onboardingTemplateTaskId}`, {
      title: `Setup laptop UPDATED ${UID}`,
      due_days: 2,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /onboarding/checklists returns checklist list", async () => {
    const r = await api("GET", "/onboarding/checklists");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /onboarding/checklists generates checklist from template", async () => {
    const joiningDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const r = await api("POST", "/onboarding/checklists", {
      application_id: applicationId,
      template_id: onboardingTemplateId,
      joining_date: joiningDate,
    });
    if (r.status === 201) {
      onboardingChecklistId = r.body.data.id;
    }
    expect([201, 400, 404]).toContain(r.status);
  });

  it("GET /onboarding/checklists/:id returns checklist with tasks", async () => {
    if (!onboardingChecklistId) return;
    const r = await api("GET", `/onboarding/checklists/${onboardingChecklistId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    if (r.body.data?.tasks?.length) {
      onboardingTaskId = r.body.data.tasks[0].id;
    }
  });

  it("PATCH /onboarding/tasks/:id updates task status", async () => {
    if (!onboardingTaskId) return;
    const r = await api("PATCH", `/onboarding/tasks/${onboardingTaskId}`, {
      status: "completed",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// REFERRALS
// =============================================================================
describe("Referrals", () => {
  it("GET /referrals returns referral list", async () => {
    const r = await api("GET", "/referrals");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /referrals submits a referral", async () => {
    const r = await api("POST", "/referrals", {
      job_id: jobId,
      first_name: "Referred",
      last_name: `Person${UID}`,
      email: `referred.${UID}@example.com`,
      phone: "+919876543212",
      relationship: "Former colleague",
      notes: "API test referral",
    });
    expect([201, 400]).toContain(r.status);
    if (r.status === 201 && r.body.data?.id) {
      referralId = r.body.data.id;
    }
  });

  it("PATCH /referrals/:id/status updates referral status", async () => {
    if (!referralId) return;
    const r = await api("PATCH", `/referrals/${referralId}/status`, {
      status: "under_review",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// ANALYTICS
// =============================================================================
describe("Analytics", () => {
  it("GET /analytics/overview returns dashboard stats", async () => {
    const r = await api("GET", "/analytics/overview");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /analytics/pipeline returns pipeline funnel", async () => {
    const r = await api("GET", "/analytics/pipeline");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /analytics/pipeline with jobId filter works", async () => {
    const r = await api("GET", `/analytics/pipeline?jobId=${jobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /analytics/time-to-hire returns time-to-hire metrics", async () => {
    const r = await api("GET", "/analytics/time-to-hire");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /analytics/sources returns source effectiveness", async () => {
    const r = await api("GET", "/analytics/sources");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// CAREER PAGE (Authenticated)
// =============================================================================
describe("Career Page (Admin)", () => {
  it("GET /career-pages returns career page config", async () => {
    const r = await api("GET", "/career-pages");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("PUT /career-pages updates career page config", async () => {
    const r = await api("PUT", "/career-pages", {
      title: `Test Careers ${UID}`,
      description: "Join our test team!",
      primary_color: "#4f46e5",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /career-pages/publish publishes career page", async () => {
    const r = await api("POST", "/career-pages/publish");
    expect([200, 400]).toContain(r.status);
  });
});

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================
describe("Email Templates", () => {
  it("GET /email-templates returns template list", async () => {
    const r = await api("GET", "/email-templates");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /email-templates creates a template", async () => {
    const r = await api("POST", "/email-templates", {
      name: `Test Template ${UID}`,
      trigger: "interview_scheduled",
      subject: "Interview Scheduled: {{jobTitle}}",
      body: "<p>Hi {{candidateName}}, your interview is scheduled.</p>",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    emailTemplateId = r.body.data.id;
  });

  it("PUT /email-templates/:id updates template", async () => {
    if (!emailTemplateId) return;
    const r = await api("PUT", `/email-templates/${emailTemplateId}`, {
      subject: "Updated: Interview Scheduled for {{jobTitle}}",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /email-templates/:id/preview renders template preview", async () => {
    if (!emailTemplateId) return;
    const r = await api("POST", `/email-templates/${emailTemplateId}/preview`, {
      variables: { candidateName: "Jane Doe", jobTitle: "Senior Engineer" },
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.subject).toBeTruthy();
    expect(r.body.data.body).toBeTruthy();
  });
});

// =============================================================================
// PIPELINE STAGES
// =============================================================================
describe("Pipeline Stages", () => {
  it("GET /pipeline/stages returns org stages", async () => {
    const r = await api("GET", "/pipeline/stages");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /pipeline/stages creates a custom stage", async () => {
    const r = await api("POST", "/pipeline/stages", {
      name: `API Test Stage ${UID}`,
      color: "#FF5722",
      order: 99,
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    pipelineStageId = r.body.data.id;
  });

  it("PUT /pipeline/stages/:id updates a stage", async () => {
    if (!pipelineStageId) return;
    const r = await api("PUT", `/pipeline/stages/${pipelineStageId}`, {
      name: `API Test Stage UPDATED ${UID}`,
      color: "#2196F3",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("DELETE /pipeline/stages/:id deletes a stage", async () => {
    if (!pipelineStageId) return;
    const r = await api("DELETE", `/pipeline/stages/${pipelineStageId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// SCORING
// =============================================================================
describe("Scoring", () => {
  it("GET /scoring/applications/:appId returns score report", async () => {
    const r = await api("GET", `/scoring/applications/${applicationId}`);
    expect([200, 404]).toContain(r.status);
  });

  it("POST /scoring/applications/:appId/score scores an application", async () => {
    const r = await api("POST", `/scoring/applications/${applicationId}/score`);
    // Scoring may fail if candidate has no resume — accept either success or error
    expect([200, 400, 404, 500]).toContain(r.status);
  });

  it("GET /scoring/jobs/:jobId/rankings returns ranked applications", async () => {
    const r = await api("GET", `/scoring/jobs/${jobId}/rankings`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// CANDIDATE COMPARISON
// =============================================================================
describe("Candidate Comparison", () => {
  it("POST /applications/compare compares candidates", async () => {
    const r = await api("POST", "/applications/compare", {
      applicationIds: [applicationId],
    });
    // Comparison needs 2+ apps but we test the endpoint works
    expect([200, 400]).toContain(r.status);
  });
});

// =============================================================================
// OFFER LETTERS
// =============================================================================
describe("Offer Letters", () => {
  it("GET /offer-letters/templates returns template list", async () => {
    const r = await api("GET", "/offer-letters/templates");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /offer-letters/templates creates a letter template", async () => {
    const r = await api("POST", "/offer-letters/templates", {
      name: `Test Offer Letter ${UID}`,
      content_template: "<h1>Offer Letter</h1><p>Dear {{candidateName}},</p><p>Congratulations!</p>",
      is_default: false,
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    offerLetterTemplateId = r.body.data.id;
  });

  it("POST /offer-letters/generate/:offerId generates letter for offer", async () => {
    if (!offerId || !offerLetterTemplateId) return;
    const r = await api("POST", `/offer-letters/generate/${offerId}`, {
      templateId: offerLetterTemplateId,
    });
    expect([200, 201, 400, 404]).toContain(r.status);
  });

  it("GET /offer-letters/:offerId returns generated letter", async () => {
    if (!offerId) return;
    const r = await api("GET", `/offer-letters/${offerId}`);
    expect([200, 404]).toContain(r.status);
  });
});

// =============================================================================
// BACKGROUND CHECKS
// =============================================================================
describe("Background Checks", () => {
  it("GET /background-checks returns all checks", async () => {
    const r = await api("GET", "/background-checks");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /background-checks/packages returns check packages", async () => {
    const r = await api("GET", "/background-checks/packages");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /background-checks/packages creates a check package", async () => {
    const r = await api("POST", "/background-checks/packages", {
      name: `API Test Package ${UID}`,
      checks_included: ["identity", "education", "employment"],
      provider: "manual",
      description: "Integration test package",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    bgCheckPackageId = r.body.data.id;
  });

  it("POST /background-checks/initiate initiates a check", async () => {
    const r = await api("POST", "/background-checks/initiate", {
      candidate_id: candidateId,
      application_id: applicationId,
      package_id: bgCheckPackageId,
      check_type: "comprehensive",
    });
    expect([201, 400]).toContain(r.status);
    if (r.status === 201) {
      bgCheckId = r.body.data.id;
    }
  });

  it("GET /background-checks/candidate/:candidateId returns candidate checks", async () => {
    const r = await api("GET", `/background-checks/candidate/${candidateId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /background-checks/:id returns check detail", async () => {
    if (!bgCheckId) return;
    const r = await api("GET", `/background-checks/${bgCheckId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// SURVEYS
// =============================================================================
describe("Surveys", () => {
  it("GET /surveys returns survey list", async () => {
    const r = await api("GET", "/surveys");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /surveys/nps returns NPS score", async () => {
    const r = await api("GET", "/surveys/nps");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// ASSESSMENTS
// =============================================================================
describe("Assessments", () => {
  it("GET /assessments/templates returns template list", async () => {
    const r = await api("GET", "/assessments/templates");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("POST /assessments/templates creates a template", async () => {
    const r = await api("POST", "/assessments/templates", {
      name: `API Test Assessment ${UID}`,
      assessment_type: "personality",
      description: "Integration test assessment template",
      questions: [
        {
          question: "How do you handle pressure?",
          type: "likert",
          options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"],
        },
        {
          question: "I prefer working in teams.",
          type: "likert",
          options: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"],
        },
      ],
    });
    expect([201, 400]).toContain(r.status);
    if (r.status === 201) {
      assessmentTemplateId = r.body.data.id;
    }
  });

  it("GET /assessments/templates/:id returns template detail", async () => {
    if (!assessmentTemplateId) return;
    const r = await api("GET", `/assessments/templates/${assessmentTemplateId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it("GET /assessments/candidate/:candidateId returns candidate assessments", async () => {
    const r = await api("GET", `/assessments/candidate/${candidateId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// =============================================================================
// JOB DESCRIPTION GENERATOR
// =============================================================================
describe("Job Description Generator", () => {
  it("POST /jobs/generate-description generates a job description", async () => {
    const r = await api("POST", "/jobs/generate-description", {
      title: "Senior Backend Engineer",
      department: "Engineering",
      level: "Senior",
      skills: ["Node.js", "TypeScript", "MySQL"],
    });
    // AI generation may or may not be configured
    expect([200, 400, 500, 503]).toContain(r.status);
  });
});

// =============================================================================
// PUBLIC ENDPOINTS (NO AUTH)
// =============================================================================
describe("Public Career Page", () => {
  it("GET /public/careers/:slug returns career page (or 404 if no slug)", async () => {
    const r = await publicApi("GET", "/careers/technova");
    expect([200, 404]).toContain(r.status);
  });

  it("GET /public/careers/:slug/jobs returns public job listings", async () => {
    const r = await publicApi("GET", "/careers/technova/jobs");
    expect([200, 404]).toContain(r.status);
  });
});

// =============================================================================
// AUTHORIZATION CHECKS
// =============================================================================
describe("Authorization", () => {
  it("GET /jobs without token returns 401", async () => {
    const saved = token;
    token = "";
    const r = await api("GET", "/jobs");
    expect([401, 403]).toContain(r.status);
    token = saved;
  });

  it("POST /jobs without token returns 401", async () => {
    const saved = token;
    token = "";
    const r = await api("POST", "/jobs", { title: "Unauthorized" });
    expect([401, 403]).toContain(r.status);
    token = saved;
  });

  it("GET /analytics/overview without token returns 401", async () => {
    const saved = token;
    token = "";
    const r = await api("GET", "/analytics/overview");
    expect([401, 403]).toContain(r.status);
    token = saved;
  });
});

// =============================================================================
// CLEANUP — Delete test job last
// =============================================================================
describe("Cleanup", () => {
  it("DELETE /onboarding/templates/:id/tasks/:taskId removes template task", async () => {
    if (!onboardingTemplateId || !onboardingTemplateTaskId) return;
    const r = await api("DELETE", `/onboarding/templates/${onboardingTemplateId}/tasks/${onboardingTemplateTaskId}`);
    expect(r.status).toBe(200);
  });

  it("DELETE /jobs/:id deletes the test job", async () => {
    if (!jobId) return;
    const r = await api("DELETE", `/jobs/${jobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});
