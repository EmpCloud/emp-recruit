// ============================================================================
// EMP RECRUIT — INTERVIEW FEATURE END-TO-END TESTS
// Hits the live API at http://localhost:4500
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.RECRUIT_API_URL || "https://test-recruit.empcloud.com";
const BASE = `${BASE_URL}/api/v1`;
const UID = Date.now();

let token: string;
let userId: number;
let testJobId: string;
let testCandidateId: string;
let testApplicationId: string;
let testInterviewId: string;
let testInterview2Id: string;
let testRecordingId: string;
let testRecording2Id: string;
let testTranscriptId: string;

/** Format a Date as MySQL-compatible datetime string: YYYY-MM-DD HH:MM:SS */
function mysqlDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

async function api(
  method: string,
  path: string,
  body?: any,
  customHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json, text };
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
// SETUP
// ============================================================================
beforeAll(async () => {
  // 1. Login
  const loginRes = await apiNoAuth("POST", "/auth/login", {
    email: "meera@technova.in",
    password: "Welcome@123",
  });
  expect(loginRes.status).toBe(200);
  token = loginRes.body.data.tokens.accessToken;
  userId = loginRes.body.data.user.empcloudUserId;

  // 2. Create a test job
  const jobRes = await api("POST", "/jobs", {
    title: `Interview Test Job ${UID}`,
    department: "Engineering",
    location: "Bengaluru, India",
    employment_type: "full_time",
    experience_min: 2,
    experience_max: 5,
    salary_min: 1000000,
    salary_max: 2000000,
    salary_currency: "INR",
    description: "A test job created for interview e2e tests.",
    skills: ["Node.js", "TypeScript"],
  });
  expect(jobRes.status).toBe(201);
  testJobId = jobRes.body.data.id;

  // 3. Publish the job
  const pubRes = await api("PATCH", `/jobs/${testJobId}/status`, {
    status: "open",
  });
  expect(pubRes.status).toBe(200);

  // 4. Create a test candidate
  const candidateEmail = `interview-test-${UID}@test.com`;
  const candRes = await api("POST", "/candidates", {
    first_name: "InterviewTest",
    last_name: "Candidate",
    email: candidateEmail,
    phone: "+91-9000000001",
    source: "direct",
    current_company: "TestCorp",
    current_title: "Developer",
    experience_years: 3,
    skills: ["JavaScript", "React"],
  });
  expect(candRes.status).toBe(201);
  testCandidateId = candRes.body.data.id;

  // 5. Create an application
  const appRes = await api("POST", "/applications", {
    job_id: testJobId,
    candidate_id: testCandidateId,
    source: "direct",
  });
  expect(appRes.status).toBe(201);
  testApplicationId = appRes.body.data.id;

  // Move application to interview stage
  await api("PATCH", `/applications/${testApplicationId}/stage`, {
    stage: "screened",
  });
  await api("PATCH", `/applications/${testApplicationId}/stage`, {
    stage: "interview",
  });
});

// ============================================================================
// 1. SCHEDULE INTERVIEW
// ============================================================================
describe("1. Schedule Interview", () => {
  it("POST /interviews — schedule a phone screen (round 1) → 201", async () => {
    const tomorrow = mysqlDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const r = await api("POST", "/interviews", {
      application_id: testApplicationId,
      type: "phone",
      round: 1,
      title: `Phone Screen ${UID}`,
      scheduled_at: tomorrow,
      duration_minutes: 45,
      location: "Phone",
      notes: "Initial phone screening",
      panelists: [{ user_id: userId, role: "lead" }],
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.type).toBe("phone");
    expect(r.body.data.round).toBe(1);
    testInterviewId = r.body.data.id;
  });

  it("POST /interviews — schedule a video interview (round 2) → 201", async () => {
    const dayAfter = mysqlDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    const r = await api("POST", "/interviews", {
      application_id: testApplicationId,
      type: "video",
      round: 2,
      title: `Video Interview ${UID}`,
      scheduled_at: dayAfter,
      duration_minutes: 60,
      location: "Google Meet",
      notes: "Technical round",
      panelists: [{ user_id: userId, role: "lead" }],
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.type).toBe("video");
    testInterview2Id = r.body.data.id;
  });

  it("POST /interviews with invalid application_id → 404", async () => {
    const tomorrow = mysqlDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const r = await api("POST", "/interviews", {
      application_id: "00000000-0000-0000-0000-000000000000",
      type: "phone",
      round: 1,
      title: "Should Fail",
      scheduled_at: tomorrow,
      duration_minutes: 30,
    });
    expect([400, 404].includes(r.status)).toBe(true);
    expect(r.body.success).toBe(false);
  });

  it("POST /interviews without auth → 401", async () => {
    const tomorrow = mysqlDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const r = await apiNoAuth("POST", "/interviews", {
      application_id: testApplicationId,
      type: "phone",
      round: 1,
      title: "No Auth",
      scheduled_at: tomorrow,
      duration_minutes: 30,
    });
    expect(r.status).toBe(401);
  });
});

// ============================================================================
// 2. LIST INTERVIEWS
// ============================================================================
describe("2. List Interviews", () => {
  it("GET /interviews → returns list including our new interviews", async () => {
    const r = await api("GET", "/interviews");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.data).toBeInstanceOf(Array);
    expect(r.body.data.data.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /interviews?application_id={id} → filter by application", async () => {
    const r = await api("GET", `/interviews?application_id=${testApplicationId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const interviews = r.body.data.data;
    expect(interviews.length).toBeGreaterThanOrEqual(2);
    // All returned interviews should belong to our application
    for (const iv of interviews) {
      expect(iv.application_id).toBe(testApplicationId);
    }
  });

  it("GET /interviews?status=scheduled → filter by status", async () => {
    const r = await api("GET", "/interviews?status=scheduled");
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const interviews = r.body.data.data;
    for (const iv of interviews) {
      expect(iv.status).toBe("scheduled");
    }
  });
});

// ============================================================================
// 3. GET INTERVIEW DETAIL
// ============================================================================
describe("3. Get Interview Detail", () => {
  it("GET /interviews/:id → returns detail with panelists and feedback arrays", async () => {
    const r = await api("GET", `/interviews/${testInterviewId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBe(testInterviewId);
    expect(r.body.data.panelists).toBeInstanceOf(Array);
    expect(r.body.data.feedback).toBeInstanceOf(Array);
    expect(r.body.data.candidate_name).toBeTruthy();
    expect(r.body.data.job_title).toBeTruthy();
  });

  it("GET /interviews/invalid-uuid → 404", async () => {
    const r = await api("GET", "/interviews/00000000-0000-0000-0000-000000000000");
    expect(r.status).toBe(404);
    expect(r.body.success).toBe(false);
  });
});

// ============================================================================
// 4. UPDATE INTERVIEW
// ============================================================================
describe("4. Update Interview", () => {
  it("PUT /interviews/:id — reschedule to day after tomorrow, 90 min", async () => {
    const dayAfterTomorrow = mysqlDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    const r = await api("PUT", `/interviews/${testInterviewId}`, {
      scheduled_at: dayAfterTomorrow,
      duration_minutes: 90,
      notes: "Rescheduled for candidate availability",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.duration_minutes).toBe(90);
  });

  it("PUT /interviews/:id — update meeting_link manually", async () => {
    const r = await api("PUT", `/interviews/${testInterviewId}`, {
      meeting_link: "https://meet.google.com/manual-test-link",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.meeting_link).toBe("https://meet.google.com/manual-test-link");
  });
});

// ============================================================================
// 5. ADD / REMOVE PANELISTS
// ============================================================================
describe("5. Add/Remove Panelists", () => {
  it("POST /interviews/:id/panelists — add user 2 as panelist", async () => {
    const r = await api("POST", `/interviews/${testInterviewId}/panelists`, {
      user_id: 2,
      role: "panelist",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.user_id).toBe(2);
  });

  it("POST /interviews/:id/panelists — add user 3 as lead panelist", async () => {
    const r = await api("POST", `/interviews/${testInterviewId}/panelists`, {
      user_id: 3,
      role: "lead",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.role).toBe("lead");
  });

  it("DELETE /interviews/:id/panelists/2 — remove panelist", async () => {
    const r = await api("DELETE", `/interviews/${testInterviewId}/panelists/2`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// ============================================================================
// 6. CHANGE STATUS
// ============================================================================
describe("6. Change Status", () => {
  it("PATCH /interviews/:id/status — change to in_progress", async () => {
    const r = await api("PATCH", `/interviews/${testInterviewId}/status`, {
      status: "in_progress",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("in_progress");
  });

  it("PATCH /interviews/:id/status — change to completed", async () => {
    const r = await api("PATCH", `/interviews/${testInterviewId}/status`, {
      status: "completed",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe("completed");
  });
});

// ============================================================================
// 7. SUBMIT FEEDBACK
// ============================================================================
describe("7. Submit Feedback", () => {
  it("POST /interviews/:id/feedback — submit feedback with scores", async () => {
    const r = await api("POST", `/interviews/${testInterviewId}/feedback`, {
      recommendation: "yes",
      technical_score: 4,
      communication_score: 4,
      cultural_fit_score: 5,
      overall_score: 4,
      strengths: "Strong system design knowledge, excellent communication",
      weaknesses: "Could improve on database optimization",
      notes: "Recommend moving to next round. Candidate showed great potential.",
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.recommendation).toBe("yes");
    expect(r.body.data.overall_score).toBe(4);
  });

  it("POST /interviews/:id/feedback — duplicate feedback should fail", async () => {
    const r = await api("POST", `/interviews/${testInterviewId}/feedback`, {
      recommendation: "yes",
      overall_score: 5,
      notes: "Duplicate attempt",
    });
    // Should fail because the same user already submitted feedback
    expect([400, 409, 422].includes(r.status)).toBe(true);
    expect(r.body.success).toBe(false);
  });

  it("GET /interviews/:id/feedback — returns feedback list", async () => {
    const r = await api("GET", `/interviews/${testInterviewId}/feedback`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const feedbacks = r.body.data;
    expect(Array.isArray(feedbacks)).toBe(true);
    expect(feedbacks.length).toBeGreaterThanOrEqual(1);
    expect(feedbacks[0].recommendation).toBe("yes");
  });
});

// ============================================================================
// 8. GENERATE MEETING LINK
// ============================================================================
describe("8. Generate Meeting Link", () => {
  it("POST /interviews/:id/generate-meet → returns a meet link", async () => {
    // Use interview2 which has no meeting_link set via generate
    const r = await api("POST", `/interviews/${testInterview2Id}/generate-meet`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.meeting_link).toBeTruthy();
    expect(r.body.data.meeting_link).toBeTruthy();
  });

  it("GET /interviews/:id → verify meeting_link is now set", async () => {
    const r = await api("GET", `/interviews/${testInterview2Id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.meeting_link).toBeTruthy();
    expect(r.body.data.meeting_link).toBeTruthy();
  });
});

// ============================================================================
// 9. SEND INVITATION
// ============================================================================
describe("9. Send Invitation", () => {
  it("POST /interviews/:id/send-invitation → success", async () => {
    const r = await api("POST", `/interviews/${testInterviewId}/send-invitation`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.sent_to).toBeInstanceOf(Array);
  });

  it("POST /interviews/:id/send-invitation for 2nd interview → still works", async () => {
    const r = await api("POST", `/interviews/${testInterview2Id}/send-invitation`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.sent_to).toBeInstanceOf(Array);
  });
});

// ============================================================================
// 10. UPLOAD & DELETE RECORDING
// ============================================================================
describe("10. Upload Recording", () => {
  it("POST /interviews/:id/recordings — upload a test file → 201", async () => {
    const formData = new FormData();
    const fileContent = new Blob(["This is a fake recording file for testing purposes."], {
      type: "audio/mpeg",
    });
    formData.append("recording", fileContent, "test-recording.mp3");

    const r = await api("POST", `/interviews/${testInterviewId}/recordings`, formData);
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    testRecordingId = r.body.data.id;
  });

  it("GET /interviews/:id/recordings → returns list with our recording", async () => {
    const r = await api("GET", `/interviews/${testInterviewId}/recordings`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const recordings = r.body.data;
    expect(Array.isArray(recordings)).toBe(true);
    expect(recordings.length).toBeGreaterThanOrEqual(1);
    const found = recordings.some((rec: any) => rec.id === testRecordingId);
    expect(found).toBe(true);
  });

  it("DELETE /interviews/:id/recordings/:recId → deletes recording", async () => {
    const r = await api("DELETE", `/interviews/${testInterviewId}/recordings/${testRecordingId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// ============================================================================
// 11. UPLOAD RECORDING + GENERATE TRANSCRIPT
// ============================================================================
describe("11. Upload Recording + Generate Transcript", () => {
  it("POST /interviews/:id/recordings — upload another test file", async () => {
    const formData = new FormData();
    const fileContent = new Blob(
      ["Second recording file with longer content for transcript generation test."],
      { type: "audio/mpeg" },
    );
    formData.append("recording", fileContent, "test-recording-2.mp3");

    const r = await api("POST", `/interviews/${testInterviewId}/recordings`, formData);
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    testRecording2Id = r.body.data.id;
  });

  it("POST /interviews/:id/recordings/:recId/transcribe → generates transcript", async () => {
    const r = await api(
      "POST",
      `/interviews/${testInterviewId}/recordings/${testRecording2Id}/transcribe`,
    );
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.data.id).toBeTruthy();
    expect(r.body.data.content).toBeTruthy();
    expect(r.body.data.status).toBe("completed");
    testTranscriptId = r.body.data.id;
  });

  it("GET /interviews/:id/transcript → returns the transcript", async () => {
    const r = await api("GET", `/interviews/${testInterviewId}/transcript`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toBeTruthy();
    expect(r.body.data.content).toBeTruthy();
    expect(r.body.data.id).toBe(testTranscriptId);
  });
});

// ============================================================================
// 12. UPDATE TRANSCRIPT SUMMARY
// ============================================================================
describe("12. Update Transcript Summary", () => {
  it("PUT /interviews/:id/transcript/:tId → update summary", async () => {
    const r = await api("PUT", `/interviews/${testInterviewId}/transcript/${testTranscriptId}`, {
      summary: "Candidate showed strong technical skills in system design and backend development.",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.summary).toBe(
      "Candidate showed strong technical skills in system design and backend development.",
    );
  });

  it("GET /interviews/:id/transcript → verify summary is updated", async () => {
    const r = await api("GET", `/interviews/${testInterviewId}/transcript`);
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toBe(
      "Candidate showed strong technical skills in system design and backend development.",
    );
  });
});

// ============================================================================
// 13. AGGREGATED FEEDBACK
// ============================================================================
describe("13. Get Aggregated Feedback", () => {
  it("GET /interviews/:id/feedback → verify feedback data", async () => {
    const r = await api("GET", `/interviews/${testInterviewId}/feedback`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const feedbacks = r.body.data;
    expect(Array.isArray(feedbacks)).toBe(true);
    expect(feedbacks.length).toBeGreaterThanOrEqual(1);
    // Verify our feedback entry has the expected fields
    const ourFb = feedbacks.find((f: any) => f.recommendation === "yes");
    expect(ourFb).toBeTruthy();
    expect(ourFb.overall_score).toBe(4);
    expect(ourFb.technical_score).toBe(4);
  });
});

// ============================================================================
// 14. CLEANUP
// ============================================================================
describe("14. Cleanup", () => {
  it("DELETE /jobs/:id → deletes the test job", async () => {
    const r = await api("DELETE", `/jobs/${testJobId}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.deleted).toBe(true);
  });
});
