/**
 * EMP Recruit — Full E2E Workflow Tests
 * Runs against live deployment at https://test-recruit-api.empcloud.com
 *
 * Covers:
 *   W1: Complete Hiring Pipeline (Applied -> Hired)
 *   W2: Onboarding Flow
 *   W3: Referral Program
 *   W4: Custom Pipeline Stages
 *   W5: Career Page & Portal
 *   W6: AI Scoring
 *   W7: Email Templates
 *   W8: SSO Login
 */

const BASE = "https://test-recruit-api.empcloud.com/api/v1";
const CLOUD_BASE = "https://test-empcloud-api.empcloud.com/api/v1";

const CREDS = { email: "ananya@technova.in", password: "Welcome@123" };

// ---------- helpers ----------

let TOKEN = "";

interface StepResult {
  step: string;
  endpoint: string;
  status: number;
  pass: boolean;
  detail?: string;
}

const results: StepResult[] = [];

async function api(
  method: string,
  path: string,
  body?: any,
  token?: string,
  expectRaw = false,
): Promise<{ status: number; data: any; raw?: Response }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tk = token ?? TOKEN;
  if (tk) headers["Authorization"] = `Bearer ${tk}`;

  const opts: RequestInit = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const contentType = res.headers.get("content-type") || "";

  if (expectRaw) {
    return { status: res.status, data: await res.text(), raw: res };
  }

  let data: any;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data };
}

function log(step: string, endpoint: string, status: number, pass: boolean, detail?: string) {
  const tag = pass ? "PASS" : "FAIL";
  results.push({ step, endpoint, status, pass, detail });
  console.log(`  ${step} | ${endpoint} | ${status} | ${tag}${detail ? " — " + detail : ""}`);
}

// ---------- login ----------

async function login(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CREDS),
    });
    const json: any = await res.json();
    if (json.success) {
      return json.data.tokens?.accessToken || json.data.accessToken || json.data.token;
    }
    if (res.status === 429 && attempt < 2) {
      const resetHeader = res.headers.get("x-ratelimit-reset");
      const waitMs = resetHeader
        ? Math.max((Number(resetHeader) * 1000 - Date.now()), 5000)
        : 15000;
      console.log(`Rate limited on login, waiting ${Math.ceil(waitMs / 1000)}s (attempt ${attempt + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60000)));
      continue;
    }
    throw new Error("Login failed: " + JSON.stringify(json));
  }
  throw new Error("Login failed after 3 attempts");
}

// ==========================================================================
//  WORKFLOW 1 — Complete Hiring Pipeline
// ==========================================================================

async function workflow1() {
  console.log("\n========== WORKFLOW 1: Complete Hiring Pipeline ==========");

  // ---- Step 1: Create job ----
  let r = await api("POST", "/jobs", {
    title: "Senior React Developer",
    employment_type: "full_time",
    location: "Bangalore (Hybrid)",
    experience_min: 5,
    experience_max: 10,
    salary_min: 1500000,
    salary_max: 2500000,
    salary_currency: "INR",
    description: "We are looking for a Senior React Developer to join our frontend team. Must have strong experience with React, TypeScript, and modern web technologies.",
    requirements: "5+ years React, TypeScript, Redux/Zustand, REST & GraphQL",
    skills: ["React", "TypeScript", "Node.js", "GraphQL"],
  });
  const jobId = r.data?.data?.id;
  log("W1.1", "POST /jobs", r.status, r.status === 201 && !!jobId, `jobId=${jobId}`);

  // ---- Step 2: Get job ----
  r = await api("GET", `/jobs/${jobId}`);
  const jobOk =
    r.status === 200 &&
    r.data?.data?.title === "Senior React Developer" &&
    r.data?.data?.employment_type === "full_time";
  log("W1.2", `GET /jobs/${jobId}`, r.status, jobOk, `title=${r.data?.data?.title}`);

  // ---- Step 3: Publish job ----
  r = await api("PATCH", `/jobs/${jobId}/status`, { status: "open" });
  const publishOk = r.status === 200 && r.data?.data?.status === "open";
  log("W1.3", `PATCH /jobs/${jobId}/status`, r.status, publishOk, `status=${r.data?.data?.status}`);

  // ---- Steps 4-6: Create candidates ----
  const candidates = [
    {
      first_name: "Priya",
      last_name: "Mehta",
      email: `priya.mehta+${Date.now()}@example.com`,
      experience_years: 7,
      current_company: "Infosys",
      source: "linkedin",
      phone: "+91-9876543210",
      skills: ["React", "TypeScript", "Node.js"],
    },
    {
      first_name: "Arjun",
      last_name: "Singh",
      email: `arjun.singh+${Date.now()}@example.com`,
      experience_years: 5,
      current_company: "TCS",
      source: "naukri",
      phone: "+91-9876543211",
      skills: ["React", "JavaScript", "Redux"],
    },
    {
      first_name: "Neha",
      last_name: "Kapoor",
      email: `neha.kapoor+${Date.now()}@example.com`,
      experience_years: 3,
      current_company: "Wipro",
      source: "direct",
      phone: "+91-9876543212",
      skills: ["React", "CSS", "HTML"],
    },
  ];

  const candidateIds: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    r = await api("POST", "/candidates", candidates[i]);
    const cId = r.data?.data?.id;
    candidateIds.push(cId);
    log(
      `W1.${4 + i}`,
      "POST /candidates",
      r.status,
      r.status === 201 && !!cId,
      `${candidates[i].first_name} id=${cId}`,
    );
  }

  // ---- Steps 7-9: Apply candidates ----
  const applicationIds: string[] = [];
  for (let i = 0; i < candidateIds.length; i++) {
    r = await api("POST", "/applications", {
      job_id: jobId,
      candidate_id: candidateIds[i],
      source: candidates[i].source,
    });
    const appId = r.data?.data?.id;
    const stage = r.data?.data?.stage;
    applicationIds.push(appId);
    log(
      `W1.${7 + i}`,
      "POST /applications",
      r.status,
      r.status === 201 && stage === "applied",
      `appId=${appId}, stage=${stage}`,
    );
  }

  // ---- Step 10: Get job applications ----
  r = await api("GET", `/jobs/${jobId}/applications`);
  const appTotal = r.data?.data?.total ?? r.data?.data?.data?.length ?? r.data?.data?.length ?? 0;
  log("W1.10", `GET /jobs/${jobId}/applications`, r.status, r.status === 200 && appTotal >= 3, `count=${appTotal}`);

  // ---- Step 11: Move candidate 1 to screened ----
  r = await api("PATCH", `/applications/${applicationIds[0]}/stage`, { stage: "screened" });
  log(
    "W1.11",
    `PATCH /applications/${applicationIds[0]}/stage`,
    r.status,
    r.status === 200 && r.data?.data?.stage === "screened",
    `stage=${r.data?.data?.stage}`,
  );

  // ---- Step 12: Move candidate 2 to screened ----
  r = await api("PATCH", `/applications/${applicationIds[1]}/stage`, { stage: "screened" });
  log(
    "W1.12",
    `PATCH /applications/${applicationIds[1]}/stage`,
    r.status,
    r.status === 200 && r.data?.data?.stage === "screened",
    `stage=${r.data?.data?.stage}`,
  );

  // ---- Step 13: Move candidate 1 to interview ----
  r = await api("PATCH", `/applications/${applicationIds[0]}/stage`, { stage: "interview" });
  log(
    "W1.13",
    `PATCH /applications/${applicationIds[0]}/stage`,
    r.status,
    r.status === 200 && r.data?.data?.stage === "interview",
    `stage=${r.data?.data?.stage}`,
  );

  // ---- Step 14: Get application timeline ----
  r = await api("GET", `/applications/${applicationIds[0]}/timeline`);
  const timeline = r.data?.data;
  const timelineCount = Array.isArray(timeline) ? timeline.length : 0;
  log(
    "W1.14",
    `GET /applications/${applicationIds[0]}/timeline`,
    r.status,
    r.status === 200 && timelineCount >= 3,
    `entries=${timelineCount}`,
  );

  // ---- Step 15: Schedule interview ----
  const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  r = await api("POST", "/interviews", {
    application_id: applicationIds[0],
    type: "video",
    round: 1,
    title: "Technical Interview — React",
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    location: "Remote",
    notes: "Focus on React architecture and TypeScript patterns",
  });
  const interviewId = r.data?.data?.id;
  log("W1.15", "POST /interviews", r.status, r.status === 201 && !!interviewId, `interviewId=${interviewId}`);

  // ---- Step 16: Generate meeting link ----
  r = await api("POST", `/interviews/${interviewId}/generate-meet`);
  const meetLink = r.data?.data?.meeting_link;
  log(
    "W1.16",
    `POST /interviews/${interviewId}/generate-meet`,
    r.status,
    r.status === 200 && !!meetLink,
    `link=${meetLink}`,
  );

  // ---- Step 17: Calendar links ----
  r = await api("GET", `/interviews/${interviewId}/calendar-links`);
  const calLinks = r.data?.data;
  const hasCalLinks =
    r.status === 200 &&
    calLinks &&
    (calLinks.google || calLinks.google_calendar) &&
    (calLinks.outlook || calLinks.outlook_calendar);
  log(
    "W1.17",
    `GET /interviews/${interviewId}/calendar-links`,
    r.status,
    !!hasCalLinks,
    `keys=${calLinks ? Object.keys(calLinks).join(",") : "none"}`,
  );

  // ---- Step 18: ICS file ----
  r = await api("GET", `/interviews/${interviewId}/calendar.ics`, undefined, undefined, true);
  const isIcs = r.status === 200 && typeof r.data === "string" && r.data.includes("BEGIN:VCALENDAR");
  log(
    "W1.18",
    `GET /interviews/${interviewId}/calendar.ics`,
    r.status,
    isIcs,
    `content-type=${r.raw?.headers?.get("content-type")}`,
  );

  // ---- Step 19: Send invitation ----
  r = await api("POST", `/interviews/${interviewId}/send-invitation`);
  log(
    "W1.19",
    `POST /interviews/${interviewId}/send-invitation`,
    r.status,
    r.status === 200,
    `result=${JSON.stringify(r.data?.data)?.substring(0, 80)}`,
  );

  // ---- Step 19.5: Add current user as panelist (needed for feedback) ----
  // Decode user id from token to add as panelist
  const tokenPayload = JSON.parse(Buffer.from(TOKEN.split(".")[1], "base64").toString());
  const currentUserId = tokenPayload.empcloudUserId;
  await api("POST", `/interviews/${interviewId}/panelists`, {
    user_id: currentUserId,
    role: "lead",
  });

  // ---- Step 20: Submit feedback ----
  r = await api("POST", `/interviews/${interviewId}/feedback`, {
    recommendation: "yes",
    technical_score: 4,
    communication_score: 4,
    cultural_fit_score: 5,
    overall_score: 4,
    strengths: "Strong React fundamentals, clean code architecture",
    weaknesses: "Could improve on system design breadth",
    notes: "Recommend for next round",
  });
  log(
    "W1.20",
    `POST /interviews/${interviewId}/feedback`,
    r.status,
    r.status === 201 || r.status === 200,
    `id=${r.data?.data?.id}`,
  );

  // ---- Step 21: Get feedback ----
  r = await api("GET", `/interviews/${interviewId}/feedback`);
  const feedbackList = r.data?.data;
  log(
    "W1.21",
    `GET /interviews/${interviewId}/feedback`,
    r.status,
    r.status === 200 && (Array.isArray(feedbackList) ? feedbackList.length > 0 : !!feedbackList),
    `count=${Array.isArray(feedbackList) ? feedbackList.length : "object"}`,
  );

  // ---- Step 22: Move candidate 1 to offer ----
  r = await api("PATCH", `/applications/${applicationIds[0]}/stage`, { stage: "offer" });
  log(
    "W1.22",
    `PATCH /applications/${applicationIds[0]}/stage`,
    r.status,
    r.status === 200 && r.data?.data?.stage === "offer",
    `stage=${r.data?.data?.stage}`,
  );

  // ---- Step 23: Create offer ----
  // Get application details to extract candidate_id and job_id
  const appDetail = await api("GET", `/applications/${applicationIds[0]}`);
  const appCandidateId = appDetail.data?.data?.candidate_id;
  const appJobId = appDetail.data?.data?.job_id;

  const joiningDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  r = await api("POST", "/offers", {
    application_id: applicationIds[0],
    candidate_id: appCandidateId,
    job_id: appJobId,
    salary_amount: 2200000,
    salary_currency: "INR",
    joining_date: joiningDate,
    expiry_date: expiryDate,
    job_title: "Senior React Developer",
    department: "Engineering",
    benefits: "Health insurance, ESOP, flexible work, learning budget",
    notes: "Competitive offer based on interview performance",
  });
  const offerId = r.data?.data?.id;
  log("W1.23", "POST /offers", r.status, r.status === 201 && !!offerId, `offerId=${offerId}`);

  // ---- Step 24: Get offer ----
  r = await api("GET", `/offers/${offerId}`);
  const offerOk = r.status === 200 && r.data?.data?.salary_amount === 2200000;
  log("W1.24", `GET /offers/${offerId}`, r.status, offerOk, `salary=${r.data?.data?.salary_amount}`);

  // ---- Step 25: Move candidate 1 to hired ----
  r = await api("PATCH", `/applications/${applicationIds[0]}/stage`, { stage: "hired" });
  log(
    "W1.25",
    `PATCH /applications/${applicationIds[0]}/stage`,
    r.status,
    r.status === 200 && r.data?.data?.stage === "hired",
    `stage=${r.data?.data?.stage}`,
  );

  // ---- Step 26: Analytics overview ----
  r = await api("GET", "/analytics/overview");
  log("W1.26", "GET /analytics/overview", r.status, r.status === 200 && !!r.data?.data, `keys=${r.data?.data ? Object.keys(r.data.data).join(",") : "none"}`);

  // ---- Step 27: Pipeline funnel ----
  r = await api("GET", "/analytics/pipeline");
  log("W1.27", "GET /analytics/pipeline", r.status, r.status === 200 && !!r.data?.data, `data=${JSON.stringify(r.data?.data)?.substring(0, 100)}`);

  // ---- Step 28: Time to hire ----
  r = await api("GET", "/analytics/time-to-hire");
  log("W1.28", "GET /analytics/time-to-hire", r.status, r.status === 200, `data=${JSON.stringify(r.data?.data)?.substring(0, 100)}`);

  // ---- Step 29: Source effectiveness ----
  r = await api("GET", "/analytics/sources");
  log("W1.29", "GET /analytics/sources", r.status, r.status === 200 && !!r.data?.data, `data=${JSON.stringify(r.data?.data)?.substring(0, 100)}`);

  // ---- Step 30: Reject candidate 3 ----
  r = await api("PATCH", `/applications/${applicationIds[2]}/stage`, {
    stage: "rejected",
    rejection_reason: "Insufficient experience for the senior role (3 yrs vs 5 min required)",
    notes: "Consider for a mid-level position in the future",
  });
  log(
    "W1.30",
    `PATCH /applications/${applicationIds[2]}/stage`,
    r.status,
    r.status === 200 && r.data?.data?.stage === "rejected",
    `stage=${r.data?.data?.stage}`,
  );

  return { jobId, candidateIds, applicationIds, interviewId, offerId };
}

// ==========================================================================
//  WORKFLOW 2 — Onboarding Flow
// ==========================================================================

async function workflow2(applicationId: string) {
  console.log("\n========== WORKFLOW 2: Onboarding Flow ==========");

  // ---- Step 1: Create template ----
  let r = await api("POST", "/onboarding/templates", {
    name: "Engineering Onboarding",
    description: "Standard onboarding template for engineering hires",
    department: "Engineering",
    is_default: false,
  });
  const templateId = r.data?.data?.id;
  log("W2.1", "POST /onboarding/templates", r.status, r.status === 201 && !!templateId, `templateId=${templateId}`);

  // ---- Step 2: Add tasks ----
  const tasks = [
    { title: "IT Setup", description: "Provision laptop, email, VPN, and dev tools access", category: "IT", due_days: -2, order: 1, is_required: true },
    { title: "Welcome Kit", description: "Send welcome kit with company swag and handbook", category: "HR", due_days: 0, order: 2, is_required: true },
    { title: "Buddy Assignment", description: "Assign an engineering buddy for first 30 days", category: "Team", due_days: 0, order: 3, is_required: true },
    { title: "First Week Goals", description: "Set up development environment and complete first starter task", category: "Engineering", due_days: 5, order: 4, is_required: true },
  ];

  const templateTaskIds: string[] = [];
  for (let i = 0; i < tasks.length; i++) {
    r = await api("POST", `/onboarding/templates/${templateId}/tasks`, tasks[i]);
    const taskId = r.data?.data?.id;
    templateTaskIds.push(taskId);
    log(
      `W2.2.${i + 1}`,
      `POST /onboarding/templates/${templateId}/tasks`,
      r.status,
      r.status === 201 && !!taskId,
      `task="${tasks[i].title}" id=${taskId}`,
    );
  }

  // ---- Step 3: Get template with tasks ----
  r = await api("GET", `/onboarding/templates`);
  const templates = r.data?.data;
  const tmpl = Array.isArray(templates)
    ? templates.find((t: any) => t.id === templateId)
    : null;
  const tmplTasks = tmpl?.tasks;
  log(
    "W2.3",
    "GET /onboarding/templates",
    r.status,
    r.status === 200 && !!tmpl,
    `found=${!!tmpl}, tasks=${tmplTasks?.length ?? "no tasks field (may need separate call)"}`,
  );

  // ---- Step 4: Generate checklist ----
  const joiningDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  r = await api("POST", "/onboarding/checklists", {
    application_id: applicationId,
    template_id: templateId,
    joining_date: joiningDate,
  });
  const checklistId = r.data?.data?.id;
  log("W2.4", "POST /onboarding/checklists", r.status, (r.status === 201 || r.status === 200) && !!checklistId, `checklistId=${checklistId}`);

  // ---- Step 5: Get checklist ----
  r = await api("GET", `/onboarding/checklists/${checklistId}`);
  const checklist = r.data?.data;
  const checklistTasks = checklist?.tasks || [];
  const allPending = checklistTasks.every((t: any) => t.status === "not_started" || t.status === "pending");
  log(
    "W2.5",
    `GET /onboarding/checklists/${checklistId}`,
    r.status,
    r.status === 200 && checklistTasks.length >= 4,
    `tasks=${checklistTasks.length}, allPending=${allPending}`,
  );

  // ---- Step 6: Mark first task complete ----
  const firstTaskId = checklistTasks[0]?.id;
  r = await api("PATCH", `/onboarding/tasks/${firstTaskId}`, { status: "completed" });
  log(
    "W2.6",
    `PATCH /onboarding/tasks/${firstTaskId}`,
    r.status,
    r.status === 200,
    `status=${r.data?.data?.status}`,
  );

  // ---- Step 7: Get checklist again ----
  r = await api("GET", `/onboarding/checklists/${checklistId}`);
  const tasksAfter = r.data?.data?.tasks || [];
  const completedCount = tasksAfter.filter((t: any) => t.status === "completed").length;
  const pendingCount = tasksAfter.filter((t: any) => t.status !== "completed").length;
  log(
    "W2.7",
    `GET /onboarding/checklists/${checklistId}`,
    r.status,
    r.status === 200 && completedCount >= 1 && pendingCount >= 3,
    `completed=${completedCount}, pending=${pendingCount}`,
  );

  return { templateId, checklistId };
}

// ==========================================================================
//  WORKFLOW 3 — Referral Program
// ==========================================================================

async function workflow3(jobId: string) {
  console.log("\n========== WORKFLOW 3: Referral Program ==========");

  // ---- Step 1: Submit referral ----
  let r = await api("POST", "/referrals", {
    job_id: jobId,
    first_name: "Rahul",
    last_name: "Verma",
    email: `rahul.verma+${Date.now()}@example.com`,
    phone: "+91-9876543999",
    relationship: "Former colleague at Infosys",
    notes: "Strong React and TypeScript developer, worked together on e-commerce platform",
  });
  const referralId = r.data?.data?.id;
  log("W3.1", "POST /referrals", r.status, r.status === 201 && !!referralId, `referralId=${referralId}`);

  // ---- Step 2: List referrals ----
  r = await api("GET", "/referrals");
  const referrals = r.data?.data;
  const refList = Array.isArray(referrals) ? referrals : referrals?.data || [];
  log(
    "W3.2",
    "GET /referrals",
    r.status,
    r.status === 200 && refList.length > 0,
    `count=${refList.length}`,
  );

  // ---- Step 3: Update referral status ----
  r = await api("PATCH", `/referrals/${referralId}/status`, { status: "hired" });
  log(
    "W3.3",
    `PATCH /referrals/${referralId}/status`,
    r.status,
    r.status === 200,
    `status=${r.data?.data?.status}`,
  );

  return { referralId };
}

// ==========================================================================
//  WORKFLOW 4 — Custom Pipeline Stages
// ==========================================================================

async function workflow4() {
  console.log("\n========== WORKFLOW 4: Custom Pipeline Stages ==========");

  // ---- Step 1: Get pipeline stages ----
  let r = await api("GET", "/pipeline/stages");
  const stages = r.data?.data;
  log(
    "W4.1",
    "GET /pipeline/stages",
    r.status,
    r.status === 200 && Array.isArray(stages),
    `count=${Array.isArray(stages) ? stages.length : 0}`,
  );

  // ---- Step 2: Create custom stage ----
  r = await api("POST", "/pipeline/stages", {
    name: "Technical Assessment",
    description: "Take-home coding assignment evaluation",
    color: "#4A90D9",
    order: 50,
  });
  const stageId = r.data?.data?.id;
  log("W4.2", "POST /pipeline/stages", r.status, r.status === 201 && !!stageId, `stageId=${stageId}`);

  // ---- Step 3: List stages again ----
  r = await api("GET", "/pipeline/stages");
  const newStages = r.data?.data;
  const found = Array.isArray(newStages) && newStages.some((s: any) => s.id === stageId || s.name === "Technical Assessment");
  log(
    "W4.3",
    "GET /pipeline/stages",
    r.status,
    r.status === 200 && found,
    `count=${Array.isArray(newStages) ? newStages.length : 0}, found=${found}`,
  );

  // Clean up custom stage
  if (stageId) {
    await api("DELETE", `/pipeline/stages/${stageId}`);
  }

  return { stageId };
}

// ==========================================================================
//  WORKFLOW 5 — Career Page & Portal
// ==========================================================================

async function workflow5(candidateEmail: string) {
  console.log("\n========== WORKFLOW 5: Career Page & Portal ==========");

  // ---- Step 1: Get career page config ----
  let r = await api("GET", "/career-pages");
  const config = r.data?.data;
  log("W5.1", "GET /career-pages", r.status, r.status === 200, `slug=${config?.slug}`);

  // ---- Step 1b: If no slug, create a career page config ----
  let slug = config?.slug;
  if (!slug) {
    const updateRes = await api("PUT", "/career-pages", {
      title: "TechNova Careers",
      description: "Join our team of innovators",
      slug: "technova",
      primary_color: "#2563EB",
    });
    slug = updateRes.data?.data?.slug || "technova";
    // Publish career page
    await api("POST", "/career-pages/publish");
  }

  // ---- Step 2: Test public career page ----
  if (slug) {
    const pubRes = await fetch(`${BASE.replace("/api/v1", "")}/api/v1/public/careers/${slug}`, {
      headers: { "Content-Type": "application/json" },
    });
    const pubData: any = await pubRes.json();
    log(
      "W5.2",
      `GET /public/careers/${slug}`,
      pubRes.status,
      pubRes.status === 200,
      `title=${pubData?.data?.title}`,
    );
  } else {
    log("W5.2", "GET /public/careers/:slug", 0, false, "SKIP — no career page slug configured");
  }

  // ---- Step 3: Request portal access ----
  const portalRes = await fetch(`${BASE.replace("/api/v1", "")}/api/v1/portal/request-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: candidateEmail }),
  });
  const portalData: any = await portalRes.json();
  log(
    "W5.3",
    "POST /portal/request-access",
    portalRes.status,
    portalRes.status === 200,
    `message=${portalData?.data?.message?.substring(0, 60)}`,
  );

  return {};
}

// ==========================================================================
//  WORKFLOW 6 — AI Scoring
// ==========================================================================

async function workflow6(applicationId: string) {
  console.log("\n========== WORKFLOW 6: AI Scoring ==========");

  // ---- Step 1: Score application ----
  let r = await api("POST", `/scoring/applications/${applicationId}/score`);
  const scored = r.status === 200 && r.data?.data;
  log(
    "W6.1",
    `POST /scoring/applications/${applicationId}/score`,
    r.status,
    r.status === 200,
    r.status === 200
      ? `score=${r.data?.data?.overall_score || r.data?.data?.overallScore}, rec=${r.data?.data?.recommendation}`
      : `error=${r.data?.error?.message?.substring(0, 100)}`,
  );

  // ---- Step 2: Get score report ----
  r = await api("GET", `/scoring/applications/${applicationId}`);
  log(
    "W6.2",
    `GET /scoring/applications/${applicationId}`,
    r.status,
    r.status === 200 || r.status === 404,
    r.status === 200
      ? `score=${r.data?.data?.overall_score}, rec=${r.data?.data?.recommendation}`
      : "No score report (expected if no resume)",
  );

  return {};
}

// ==========================================================================
//  WORKFLOW 7 — Email Templates
// ==========================================================================

async function workflow7() {
  console.log("\n========== WORKFLOW 7: Email Templates ==========");

  // ---- Step 1: List email templates ----
  let r = await api("GET", "/email-templates");
  const templates = r.data?.data;
  log(
    "W7.1",
    "GET /email-templates",
    r.status,
    r.status === 200,
    `count=${Array.isArray(templates) ? templates.length : 0}`,
  );

  // ---- Step 2: Create template ----
  r = await api("POST", "/email-templates", {
    name: "Interview Scheduled Notification",
    trigger: "interview_scheduled",
    subject: "Interview Scheduled: {{jobTitle}} at {{orgName}}",
    body: "Dear {{candidateName}},\n\nYour interview for the position of {{jobTitle}} at {{orgName}} has been scheduled.\n\nDate: {{interviewDate}}\nTime: {{interviewTime}}\nType: {{interviewType}}\n\n{{#if meetingLink}}Join here: {{meetingLink}}{{/if}}\n\nBest regards,\n{{orgName}} Recruitment Team",
    is_active: true,
  });
  const emailTemplateId = r.data?.data?.id;
  log(
    "W7.2",
    "POST /email-templates",
    r.status,
    r.status === 201 && !!emailTemplateId,
    `id=${emailTemplateId}`,
  );

  return { emailTemplateId };
}

// ==========================================================================
//  WORKFLOW 8 — SSO Login
// ==========================================================================

async function workflow8() {
  console.log("\n========== WORKFLOW 8: SSO Login ==========");

  // ---- Step 1: Get Cloud token ----
  const cloudRes = await fetch(`${CLOUD_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CREDS),
  });
  const cloudJson: any = await cloudRes.json();
  const cloudToken = cloudJson?.data?.tokens?.access_token || cloudJson?.data?.tokens?.accessToken || cloudJson?.data?.accessToken || cloudJson?.data?.token;
  log(
    "W8.1",
    "POST cloud/auth/login",
    cloudRes.status,
    cloudRes.status === 200 && !!cloudToken,
    `tokenLen=${cloudToken?.length}`,
  );

  if (!cloudToken) {
    log("W8.2", "POST /auth/sso", 0, false, "SKIP — no cloud token");
    log("W8.3", "GET /jobs (SSO token)", 0, false, "SKIP — no SSO token");
    return {};
  }

  // Wait to avoid auth rate limiter (auth endpoints are aggressively rate-limited)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // ---- Step 2: Exchange for Recruit token ----
  let r = await api("POST", "/auth/sso", { token: cloudToken });
  // Retry once if rate limited
  if (r.status === 429) {
    console.log("    (rate limited, waiting 10s and retrying...)");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    r = await api("POST", "/auth/sso", { token: cloudToken });
  }
  const ssoToken = r.data?.data?.tokens?.accessToken || r.data?.data?.accessToken || r.data?.data?.token;
  log(
    "W8.2",
    "POST /auth/sso",
    r.status,
    r.status === 200 && !!ssoToken,
    `tokenLen=${ssoToken?.length}`,
  );

  if (!ssoToken) {
    log("W8.3", "GET /jobs (SSO token)", 0, false, "SKIP — SSO exchange failed");
    return {};
  }

  // ---- Step 3: Use SSO token to call GET /jobs ----
  r = await api("GET", "/jobs", undefined, ssoToken);
  log(
    "W8.3",
    "GET /jobs (SSO token)",
    r.status,
    r.status === 200,
    `jobCount=${r.data?.data?.length ?? "paginated"}`,
  );

  return { ssoToken };
}

// ==========================================================================
//  MAIN
// ==========================================================================

async function main() {
  console.log("=".repeat(70));
  console.log("EMP Recruit — E2E Workflow Tests");
  console.log(`Target: ${BASE}`);
  console.log(`Time:   ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  // Login
  try {
    TOKEN = await login();
    console.log(`\nLogin OK — token length: ${TOKEN.length}\n`);
  } catch (err: any) {
    console.error("FATAL: Login failed:", err.message);
    process.exit(1);
  }

  // Run SSO workflow first (fewest auth requests, before rate limit window fills)
  try {
    await workflow8();
  } catch (err: any) {
    console.error("W8 ERROR:", err.message);
  }

  // Run remaining workflows
  let w1: any = {};
  try {
    w1 = await workflow1();
  } catch (err: any) {
    console.error("W1 ERROR:", err.message);
  }

  try {
    if (w1.applicationIds?.[0]) {
      await workflow2(w1.applicationIds[0]);
    } else {
      console.log("\nSKIP W2: No application ID from W1");
    }
  } catch (err: any) {
    console.error("W2 ERROR:", err.message);
  }

  try {
    if (w1.jobId) {
      await workflow3(w1.jobId);
    } else {
      console.log("\nSKIP W3: No job ID from W1");
    }
  } catch (err: any) {
    console.error("W3 ERROR:", err.message);
  }

  try {
    await workflow4();
  } catch (err: any) {
    console.error("W4 ERROR:", err.message);
  }

  try {
    const candidateEmail = `priya.mehta+${Date.now()}@example.com`;
    await workflow5(candidateEmail);
  } catch (err: any) {
    console.error("W5 ERROR:", err.message);
  }

  try {
    if (w1.applicationIds?.[0]) {
      await workflow6(w1.applicationIds[0]);
    } else {
      console.log("\nSKIP W6: No application ID");
    }
  } catch (err: any) {
    console.error("W6 ERROR:", err.message);
  }

  try {
    await workflow7();
  } catch (err: any) {
    console.error("W7 ERROR:", err.message);
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  console.log("");

  if (failed > 0) {
    console.log("FAILURES:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ${r.step} | ${r.endpoint} | ${r.status} | ${r.detail || ""}`);
    }
  }

  console.log("\n" + "=".repeat(70));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
