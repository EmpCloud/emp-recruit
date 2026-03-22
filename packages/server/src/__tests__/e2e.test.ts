// ============================================================================
// EMP RECRUIT — END-TO-END FUNCTIONAL TESTS
// Hits the live API at http://localhost:4500
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:4500/api/v1";
const HEALTH_BASE = "http://localhost:4500";
let token: string;
let refreshToken: string;

// Unique suffix to avoid collisions with seeded data
const UID = Date.now();

/** Format a Date as MySQL-compatible datetime string: YYYY-MM-DD HH:MM:SS */
function mysqlDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

// Shared IDs populated across tests
let jobId: string;
let candidateId: string;
let candidateEmail: string;
let applicationId: string;
let interviewId: string;
let offerId: string;
let onboardingTemplateId: string;
let onboardingTemplateTaskId: string;
let onboardingChecklistId: string;
let onboardingTaskId: string;
let referralJobId: string; // a separate open job for referrals
let referralId: string;
let userId: number; // empcloudUserId from login

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function apiNoAuth(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ============================================================================
// HEALTH
// ============================================================================
describe("Health", () => {
  it("GET /health → returns ok", async () => {
    const res = await fetch(`${HEALTH_BASE}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });
});

// ============================================================================
// AUTH
// ============================================================================
describe("Auth", () => {
  it("POST /auth/login with valid credentials → 200, returns tokens", async () => {
    const r = await apiNoAuth("POST", "/auth/login", {
      email: "ananya@technova.in",
      password: "Welcome@123",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.tokens.accessToken).toBeTruthy();
    expect(r.body.data.tokens.refreshToken).toBeTruthy();
    expect(r.body.data.user.email).toBe("ananya@technova.in");

    // Store for all subsequent tests
    token = r.body.data.tokens.accessToken;
    refreshToken = r.body.data.tokens.refreshToken;
    userId = r.body.data.user.empcloudUserId;
  });

  it("POST /auth/login with wrong password → 401", async () => {
    const r = await apiNoAuth("POST", "/auth/login", {
      email: "ananya@technova.in",
      password: "WrongPassword!",
    });
    expect(r.status).toBe(401);
    expect(r.body.success).toBe(false);
  });

  it("POST /auth/sso with invalid token → 401 or 400", async () => {
    const r = await apiNoAuth("POST", "/auth/sso", {
      token: "invalid.jwt.token",
    });
    // Server should reject the invalid SSO token
    expect([400, 401, 422, 500].includes(r.status)).toBe(true);
    expect(r.body.success).toBe(false);
  });

  it("POST /auth/sso with empty token → validation error", async () => {
    const r = await apiNoAuth("POST", "/auth/sso", { token: "" });
    expect([400, 422].includes(r.status)).toBe(true);
    expect(r.body.success).toBe(false);
  });

  it("GET protected endpoint without token → 401", async () => {
    const r = await apiNoAuth("GET", "/jobs");
    expect(r.status).toBe(401);
  });
});

// ============================================================================
// JOBS
// ============================================================================
describe("Jobs", () => {
  it("POST /jobs → creates job, returns id", async () => {
    const r = await api("POST", "/jobs", {
      title: `Senior Backend Engineer ${UID}`,
      department: "Engineering",
      location: "Bengaluru, India",
      employment_type: "full_time",
      experience_min: 3,
      experience_max: 7,
      salary_min: 1500000,
      salary_max: 3000000,
      salary_currency: "INR",
      description: "We are looking for a senior backend engineer to join our team and build scalable microservices.",
      requirements: "Node.js, TypeScript, MySQL, Redis",
      benefits: "Health insurance, flexible hours, remote work options",
      skills: ["Node.js", "TypeScript", "MySQL"],
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.title).toContain("Senior Backend Engineer");
    jobId = r.body.data.id;
  });

  it("GET /jobs → lists jobs", async () => {
    const r = await api("GET", "/jobs");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.data).toBeInstanceOf(Array);
    expect(r.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /jobs/:id → returns job detail", async () => {
    const r = await api("GET", `/jobs/${jobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(jobId);
    expect(r.body.data.title).toContain("Senior Backend Engineer");
  });

  it("PUT /jobs/:id → updates job", async () => {
    const r = await api("PUT", `/jobs/${jobId}`, {
      title: `Lead Backend Engineer ${UID}`,
      description: "Updated: We need a lead backend engineer for our platform team building scalable services.",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.title).toContain("Lead Backend Engineer");
  });

  it("PATCH /jobs/:id/status → changes status to open", async () => {
    const r = await api("PATCH", `/jobs/${jobId}/status`, {
      status: "open",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("open");
  });

  it("GET /jobs/:id/applications → lists applications for job (initially empty or existing)", async () => {
    const r = await api("GET", `/jobs/${jobId}/applications`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.data).toBeInstanceOf(Array);
  });

  it("GET /jobs/:id/analytics → returns analytics", async () => {
    const r = await api("GET", `/jobs/${jobId}/analytics`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });

  // DELETE test will run later, after all dependent tests
});

// ============================================================================
// CANDIDATES
// ============================================================================
describe("Candidates", () => {
  it("POST /candidates → creates candidate", async () => {
    candidateEmail = `priya.sharma.${UID}@example.com`;
    const r = await api("POST", "/candidates", {
      first_name: "Priya",
      last_name: "Sharma",
      email: candidateEmail,
      phone: "+91-9876543210",
      source: "direct",
      current_company: "Infosys",
      current_title: "Software Engineer",
      experience_years: 4,
      skills: ["Java", "Spring Boot", "PostgreSQL"],
      notes: "Strong candidate referred by engineering team",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.email).toBe(candidateEmail);
    candidateId = r.body.data.id;
  });

  it("POST /candidates with duplicate email → 409 conflict", async () => {
    const r = await api("POST", "/candidates", {
      first_name: "Priya",
      last_name: "Sharma",
      email: candidateEmail,
      source: "direct",
    });
    expect(r.status).toBe(409);
    expect(r.body.success).toBe(false);
  });

  it("GET /candidates → lists with pagination", async () => {
    const r = await api("GET", "/candidates?page=1&perPage=10");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.data).toBeInstanceOf(Array);
    expect(r.body.data.page).toBe(1);
    expect(r.body.data.perPage).toBe(10);
  });

  it("GET /candidates → search by name works", async () => {
    const r = await api("GET", `/candidates?search=Priya`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const found = r.body.data.data.some(
      (c: any) => c.first_name === "Priya" && c.email === candidateEmail,
    );
    expect(found).toBe(true);
  });

  it("GET /candidates/:id → returns candidate detail", async () => {
    const r = await api("GET", `/candidates/${candidateId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(candidateId);
    expect(r.body.data.first_name).toBe("Priya");
  });

  it("PUT /candidates/:id → updates candidate", async () => {
    const r = await api("PUT", `/candidates/${candidateId}`, {
      current_title: "Senior Software Engineer",
      experience_years: 5,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.current_title).toBe("Senior Software Engineer");
  });
});

// ============================================================================
// APPLICATIONS / ATS PIPELINE
// ============================================================================
describe("Applications", () => {
  it("POST /applications → creates application (applied stage)", async () => {
    const r = await api("POST", "/applications", {
      job_id: jobId,
      candidate_id: candidateId,
      source: "direct",
      cover_letter: "I am excited to apply for this role. My experience in backend engineering aligns well with your requirements.",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.stage).toBe("applied");
    applicationId = r.body.data.id;
  });

  it("POST /applications duplicate → 409 conflict", async () => {
    const r = await api("POST", "/applications", {
      job_id: jobId,
      candidate_id: candidateId,
      source: "direct",
    });
    expect(r.status).toBe(409);
    expect(r.body.success).toBe(false);
  });

  it("GET /applications → lists applications", async () => {
    const r = await api("GET", "/applications");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.data).toBeInstanceOf(Array);
  });

  it("GET /applications/:id → returns detail", async () => {
    const r = await api("GET", `/applications/${applicationId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(applicationId);
    expect(r.body.data.job_id).toBe(jobId);
    expect(r.body.data.candidate_id).toBe(candidateId);
  });

  it("PATCH /applications/:id/stage → moves to screened", async () => {
    const r = await api("PATCH", `/applications/${applicationId}/stage`, {
      stage: "screened",
      notes: "Candidate has relevant experience, moving to screening round.",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.stage).toBe("screened");
  });

  it("PATCH /applications/:id/stage → moves to interview", async () => {
    const r = await api("PATCH", `/applications/${applicationId}/stage`, {
      stage: "interview",
      notes: "Screening passed, scheduling technical interview.",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.stage).toBe("interview");
  });

  it("GET /applications/:id/timeline → returns stage history", async () => {
    const r = await api("GET", `/applications/${applicationId}/timeline`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    // Should have at least the transitions: applied → screened → interview
    const timeline = r.body.data;
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// INTERVIEWS
// ============================================================================
describe("Interviews", () => {
  it("POST /interviews → schedules interview", async () => {
    const scheduledAt = mysqlDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const r = await api("POST", "/interviews", {
      application_id: applicationId,
      type: "video",
      round: 1,
      title: "Technical Interview - Backend",
      scheduled_at: scheduledAt,
      duration_minutes: 60,
      location: "Google Meet",
      meeting_link: "https://meet.google.com/abc-defg-hij",
      notes: "Focus on system design and Node.js fundamentals",
      panelists: [{ user_id: userId, role: "lead" }],
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.title).toBe("Technical Interview - Backend");
    interviewId = r.body.data.id;
  });

  it("GET /interviews → lists interviews", async () => {
    const r = await api("GET", "/interviews");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.data).toBeInstanceOf(Array);
    expect(r.body.data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /interviews/:id → returns detail with panelists", async () => {
    const r = await api("GET", `/interviews/${interviewId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(interviewId);
    expect(r.body.data.type).toBe("video");
    // Should have panelists array
    expect(r.body.data.panelists).toBeInstanceOf(Array);
  });

  it("PUT /interviews/:id → reschedules", async () => {
    const newDate = mysqlDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
    const r = await api("PUT", `/interviews/${interviewId}`, {
      scheduled_at: newDate,
      duration_minutes: 90,
      notes: "Rescheduled to accommodate candidate availability",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.duration_minutes).toBe(90);
  });

  it("POST /interviews/:id/feedback → submits feedback scorecard", async () => {
    const r = await api("POST", `/interviews/${interviewId}/feedback`, {
      recommendation: "yes",
      technical_score: 4,
      communication_score: 4,
      cultural_fit_score: 5,
      overall_score: 4,
      strengths: "Strong system design knowledge, good communication skills",
      weaknesses: "Could improve on database optimization techniques",
      notes: "Recommend moving to next round",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.recommendation).toBe("yes");
  });

  it("GET /interviews/:id/feedback → returns feedback", async () => {
    const r = await api("GET", `/interviews/${interviewId}/feedback`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const feedbacks = r.body.data;
    expect(Array.isArray(feedbacks)).toBe(true);
    expect(feedbacks.length).toBeGreaterThanOrEqual(1);
    expect(feedbacks[0].recommendation).toBe("yes");
  });
});

// ============================================================================
// OFFERS
// ============================================================================
describe("Offers", () => {
  it("POST /offers → creates offer", async () => {
    const joiningDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const expiryDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const r = await api("POST", "/offers", {
      application_id: applicationId,
      candidate_id: candidateId,
      job_id: jobId,
      salary_amount: 2400000,
      salary_currency: "INR",
      joining_date: joiningDate,
      expiry_date: expiryDate,
      job_title: "Lead Backend Engineer",
      department: "Engineering",
      benefits: "Health insurance, stock options, annual bonus",
      notes: "Competitive offer for senior role",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.status).toBe("draft");
    offerId = r.body.data.id;
  });

  it("GET /offers/:id → returns offer with approvers", async () => {
    const r = await api("GET", `/offers/${offerId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(offerId);
    expect(r.body.data.salary_amount).toBe(2400000);
    expect(r.body.data.approvers).toBeInstanceOf(Array);
  });

  it("PUT /offers/:id → updates offer", async () => {
    const r = await api("PUT", `/offers/${offerId}`, {
      salary_amount: 2600000,
      benefits: "Health insurance, stock options, annual bonus, relocation allowance",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.salary_amount).toBe(2600000);
  });

  it("POST /offers/:id/submit-approval → submits for approval", async () => {
    const r = await api("POST", `/offers/${offerId}/submit-approval`, {
      approver_ids: [userId],
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("pending_approval");
  });

  it("POST /offers/:id/approve → approves offer", async () => {
    const r = await api("POST", `/offers/${offerId}/approve`, {
      comment: "Approved — salary is within budget",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("approved");
  });

  it("POST /offers/:id/send → sends offer", async () => {
    const r = await api("POST", `/offers/${offerId}/send`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("sent");
    expect(r.body.data.sent_at).toBeTruthy();
  });

  it("POST /offers/:id/accept → accepts offer, application moves to hired", async () => {
    const r = await api("POST", `/offers/${offerId}/accept`, {
      notes: "Excited to join the team!",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("accepted");

    // Verify application moved to hired
    const appR = await api("GET", `/applications/${applicationId}`);
    expect(appR.body.data.stage).toBe("hired");
  });
});

// ============================================================================
// ONBOARDING
// ============================================================================
describe("Onboarding", () => {
  it("POST /onboarding/templates → creates template", async () => {
    const r = await api("POST", "/onboarding/templates", {
      name: `Engineering Onboarding ${UID}`,
      description: "Standard onboarding template for engineering hires",
      department: "Engineering",
      is_default: false,
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.name).toContain("Engineering Onboarding");
    onboardingTemplateId = r.body.data.id;
  });

  it("POST /onboarding/templates/:id/tasks → adds task", async () => {
    const r = await api("POST", `/onboarding/templates/${onboardingTemplateId}/tasks`, {
      title: "Setup laptop and development environment",
      description: "Install IDE, clone repos, configure VPN",
      category: "it_setup",
      assignee_role: "it_admin",
      due_days: 1,
      order: 1,
      is_required: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    onboardingTemplateTaskId = r.body.data.id;
  });

  it("POST /onboarding/checklists → generates checklist from template", async () => {
    const joiningDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const r = await api("POST", "/onboarding/checklists", {
      application_id: applicationId,
      template_id: onboardingTemplateId,
      joining_date: joiningDate,
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    onboardingChecklistId = r.body.data.id;
  });

  it("GET /onboarding/checklists/:id → returns checklist with tasks", async () => {
    const r = await api("GET", `/onboarding/checklists/${onboardingChecklistId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(onboardingChecklistId);
    // Should have tasks array
    const tasks = r.body.data.tasks;
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    onboardingTaskId = tasks[0].id;
  });

  it("PATCH /onboarding/tasks/:id → marks task complete", async () => {
    const r = await api("PATCH", `/onboarding/tasks/${onboardingTaskId}`, {
      status: "completed",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("completed");
  });
});

// ============================================================================
// REFERRALS
// ============================================================================
describe("Referrals", () => {
  beforeAll(async () => {
    // Create a separate open job for referrals to avoid conflicts
    const r = await api("POST", "/jobs", {
      title: `DevOps Engineer ${UID}`,
      department: "Infrastructure",
      location: "Hyderabad, India",
      employment_type: "full_time",
      experience_min: 2,
      experience_max: 5,
      salary_min: 1200000,
      salary_max: 2000000,
      salary_currency: "INR",
      description: "We are looking for a DevOps engineer to manage our cloud infrastructure and CI/CD pipelines.",
      skills: ["AWS", "Docker", "Kubernetes", "Terraform"],
    });
    referralJobId = r.body.data.id;

    // Open the job
    await api("PATCH", `/jobs/${referralJobId}/status`, { status: "open" });
  });

  it("POST /referrals → submits referral", async () => {
    const r = await api("POST", "/referrals", {
      job_id: referralJobId,
      first_name: "Rajesh",
      last_name: "Kumar",
      email: `rajesh.kumar.${UID}@example.com`,
      phone: "+91-9988776655",
      relationship: "Former colleague at Wipro",
      notes: "Excellent DevOps engineer with AWS expertise",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    referralId = r.body.data.id;
  });

  it("GET /referrals → lists referrals", async () => {
    const r = await api("GET", "/referrals");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });

  it("PATCH /referrals/:id/status → updates status", async () => {
    const r = await api("PATCH", `/referrals/${referralId}/status`, {
      status: "under_review",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("under_review");
  });
});

// ============================================================================
// ANALYTICS
// ============================================================================
describe("Analytics", () => {
  it("GET /analytics/overview → returns dashboard stats", async () => {
    const r = await api("GET", "/analytics/overview");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });

  it("GET /analytics/pipeline → returns pipeline funnel", async () => {
    const r = await api("GET", "/analytics/pipeline");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });

  it("GET /analytics/time-to-hire → returns metric", async () => {
    const r = await api("GET", "/analytics/time-to-hire");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });

  it("GET /analytics/sources → returns source breakdown", async () => {
    const r = await api("GET", "/analytics/sources");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
  });
});

// ============================================================================
// SSO FLOW (with EMP Cloud at localhost:3000)
// ============================================================================
describe("SSO Flow", () => {
  it("Full SSO: get EMP Cloud token, exchange at /auth/sso, verify returned token works", async () => {
    // Step 1: Login to EMP Cloud to get a token
    let empCloudToken: string | null = null;
    try {
      const empCloudRes = await fetch("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ananya@technova.in",
          password: "Welcome@123",
        }),
      });
      if (empCloudRes.ok) {
        const empCloudBody = await empCloudRes.json();
        empCloudToken = empCloudBody.data?.tokens?.accessToken || empCloudBody.data?.accessToken || null;
      }
    } catch {
      // EMP Cloud may not be running — skip gracefully
    }

    if (!empCloudToken) {
      // Cannot test SSO if EMP Cloud is not available — mark as skipped info
      console.log("EMP Cloud not available at localhost:3000, skipping SSO exchange test");
      return;
    }

    // Step 2: Exchange at /auth/sso
    const ssoRes = await apiNoAuth("POST", "/auth/sso", { token: empCloudToken });
    expect(ssoRes.status).toBe(200);
    expect(ssoRes.body.success).toBe(true);
    expect(ssoRes.body.data.tokens.accessToken).toBeTruthy();

    // Step 3: Verify the returned token works for API calls
    const ssoToken = ssoRes.body.data.tokens.accessToken;
    const jobsRes = await fetch(`${BASE}/jobs`, {
      headers: { Authorization: `Bearer ${ssoToken}` },
    });
    expect(jobsRes.status).toBe(200);
  });

  it("SSO with expired/invalid token → proper error", async () => {
    const r = await apiNoAuth("POST", "/auth/sso", {
      token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjk5OTksIm9yZ19pZCI6OTk5OSwiZW1haWwiOiJmYWtlQGZha2UuY29tIiwicm9sZSI6ImhyX2FkbWluIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.fake-signature",
    });
    expect([400, 401, 403, 500].includes(r.status)).toBe(true);
    expect(r.body.success).toBe(false);
  });
});

// ============================================================================
// CLEANUP — DELETE JOB (last, since other tests depend on it)
// ============================================================================
describe("Jobs Cleanup", () => {
  it("DELETE /jobs/:id → deletes referral job", async () => {
    const r = await api("DELETE", `/jobs/${referralJobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.deleted).toBe(true);
  });

  it("DELETE /jobs/:id → deletes main job", async () => {
    const r = await api("DELETE", `/jobs/${jobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.deleted).toBe(true);
  });
});
