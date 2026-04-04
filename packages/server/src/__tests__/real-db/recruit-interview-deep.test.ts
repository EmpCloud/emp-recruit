// =============================================================================
// RECRUIT INTERVIEW DEEP — scheduling, panelists, feedback, calendar, aggregation
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import knexLib, { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

let db: Knex;
const ORG_ID = 5;
const USER_ID = 522;
const TS = Date.now();
const cleanup: { table: string; id: string }[] = [];

beforeAll(async () => {
  db = knexLib({
    client: "mysql2",
    connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_recruit" },
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

async function seedJob(): Promise<string> {
  const id = uuidv4();
  await db("job_postings").insert({
    id, organization_id: ORG_ID, title: `Job-${TS}`, slug: `job-${id}`,
    description: "Test job posting", department: "Engineering",
    status: "published", created_by: USER_ID,
    location: "Remote", employment_type: "full_time",
  });
  cleanup.push({ table: "job_postings", id });
  return id;
}

async function seedCandidate(): Promise<string> {
  const id = uuidv4();
  await db("candidates").insert({
    id, organization_id: ORG_ID, first_name: `Cand-${TS}`, last_name: "Test",
    email: `cand-${TS}@test.com`, phone: "+911234567890", source: "direct",
  });
  cleanup.push({ table: "candidates", id });
  return id;
}

async function seedApplication(jobId: string, candId: string): Promise<string> {
  const id = uuidv4();
  await db("applications").insert({
    id, organization_id: ORG_ID, job_id: jobId, candidate_id: candId,
    stage: "screening",
  });
  cleanup.push({ table: "applications", id });
  return id;
}

// ==========================================================================
// INTERVIEW SCHEDULING
// ==========================================================================
describe("Interview Scheduling", () => {
  it("should schedule a technical interview", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "technical", round: 1, title: "Tech Round 1",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
      meeting_link: "https://meet.jit.si/emp-recruit-test", status: "scheduled",
      created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const row = await db("interviews").where({ id: iid }).first();
    expect(row.type).toBe("technical");
    expect(row.round).toBe(1);
    expect(row.status).toBe("scheduled");
  });

  it("should reschedule an interview", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "hr", round: 2, title: "HR Round",
      scheduled_at: new Date("2026-04-15T14:00:00Z"), duration_minutes: 45,
      status: "scheduled", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    await db("interviews").where({ id: iid }).update({
      scheduled_at: new Date("2026-04-16T10:00:00Z"), location: "Meeting Room 3",
    });

    const row = await db("interviews").where({ id: iid }).first();
    expect(row.location).toBe("Meeting Room 3");
  });

  it("should change status through lifecycle: scheduled -> in_progress -> completed", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "panel", round: 1, title: "Panel Interview",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 90,
      status: "scheduled", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    for (const status of ["in_progress", "completed"]) {
      await db("interviews").where({ id: iid }).update({ status });
      const row = await db("interviews").where({ id: iid }).first();
      expect(row.status).toBe(status);
    }
  });

  it("should cancel an interview", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "phone_screen", round: 1, title: "Phone Screen",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 30,
      status: "scheduled", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    await db("interviews").where({ id: iid }).update({ status: "cancelled" });
    const row = await db("interviews").where({ id: iid }).first();
    expect(row.status).toBe("cancelled");
  });

  it("should generate a Jitsi meeting link", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "technical", round: 1, title: "Tech Interview",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
      status: "scheduled", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const shortId = iid.split("-")[0];
    const meetingLink = `https://meet.jit.si/emp-recruit-${shortId}`;
    await db("interviews").where({ id: iid }).update({ meeting_link: meetingLink });

    const row = await db("interviews").where({ id: iid }).first();
    expect(row.meeting_link).toContain("meet.jit.si");
  });
});

// ==========================================================================
// PANELISTS
// ==========================================================================
describe("Interview Panelists", () => {
  it("should add panelists to an interview", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "panel", round: 1, title: "Panel",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
      status: "scheduled", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const p1 = uuidv4();
    const p2 = uuidv4();
    await db("interview_panelists").insert([
      { id: p1, interview_id: iid, user_id: 522, role: "interviewer" },
      { id: p2, interview_id: iid, user_id: 524, role: "observer" },
    ]);
    cleanup.push({ table: "interview_panelists", id: p1 });
    cleanup.push({ table: "interview_panelists", id: p2 });

    const panelists = await db("interview_panelists").where({ interview_id: iid });
    expect(panelists.length).toBe(2);
  });

  it("should remove a panelist", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "technical", round: 1, title: "Tech",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
      status: "scheduled", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const pid = uuidv4();
    await db("interview_panelists").insert({ id: pid, interview_id: iid, user_id: 524, role: "interviewer" });

    await db("interview_panelists").where({ interview_id: iid, user_id: 524 }).del();
    const remaining = await db("interview_panelists").where({ interview_id: iid });
    expect(remaining.length).toBe(0);
  });
});

// ==========================================================================
// FEEDBACK
// ==========================================================================
describe("Interview Feedback", () => {
  it("should submit feedback with scores", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "technical", round: 1, title: "Tech R1",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
      status: "completed", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const pid = uuidv4();
    await db("interview_panelists").insert({ id: pid, interview_id: iid, user_id: USER_ID, role: "interviewer" });
    cleanup.push({ table: "interview_panelists", id: pid });

    const fid = uuidv4();
    await db("interview_feedback").insert({
      id: fid, interview_id: iid, panelist_id: USER_ID,
      recommendation: "strong_hire", technical_score: 9, communication_score: 8,
      cultural_fit_score: 7, overall_score: 8,
      strengths: "Strong algorithms", weaknesses: "Needs frontend skills",
      notes: "Recommend for backend role",
    });
    cleanup.push({ table: "interview_feedback", id: fid });

    const fb = await db("interview_feedback").where({ id: fid }).first();
    expect(fb.recommendation).toBe("strong_hire");
    expect(fb.technical_score).toBe(9);
    expect(fb.overall_score).toBe(8);
  });

  it("should aggregate feedback across multiple interviews for one application", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    // Two interviews
    const iids: string[] = [];
    for (let round = 1; round <= 2; round++) {
      const iid = uuidv4();
      await db("interviews").insert({
        id: iid, organization_id: ORG_ID, application_id: appId,
        type: "technical", round, title: `Round ${round}`,
        scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
        status: "completed", created_by: USER_ID,
      });
      cleanup.push({ table: "interviews", id: iid });
      iids.push(iid);

      const pid = uuidv4();
      await db("interview_panelists").insert({ id: pid, interview_id: iid, user_id: USER_ID, role: "interviewer" });
      cleanup.push({ table: "interview_panelists", id: pid });

      const fid = uuidv4();
      await db("interview_feedback").insert({
        id: fid, interview_id: iid, panelist_id: USER_ID,
        recommendation: round === 1 ? "hire" : "strong_hire",
        overall_score: round === 1 ? 7 : 9,
      });
      cleanup.push({ table: "interview_feedback", id: fid });
    }

    // Aggregate
    const feedbacks = await db("interview_feedback")
      .whereIn("interview_id", iids);
    expect(feedbacks.length).toBe(2);
    const avgScore = feedbacks.reduce((s: number, f: any) => s + (f.overall_score || 0), 0) / feedbacks.length;
    expect(avgScore).toBe(8);
  });
});

// ==========================================================================
// RECORDINGS & TRANSCRIPTS
// ==========================================================================
describe("Interview Recordings & Transcripts", () => {
  it("should add a recording to an interview", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "technical", round: 1, title: "Tech R1",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 60,
      status: "completed", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const rid = uuidv4();
    await db("interview_recordings").insert({
      id: rid, organization_id: ORG_ID, interview_id: iid,
      file_path: "/recordings/interview-001.mp4", file_size: 52428800,
      duration_seconds: 3600, mime_type: "video/mp4", uploaded_by: USER_ID,
    });
    cleanup.push({ table: "interview_recordings", id: rid });

    const row = await db("interview_recordings").where({ id: rid }).first();
    expect(row.duration_seconds).toBe(3600);
  });

  it("should add a transcript for a recording", async () => {
    const jobId = await seedJob();
    const candId = await seedCandidate();
    const appId = await seedApplication(jobId, candId);

    const iid = uuidv4();
    await db("interviews").insert({
      id: iid, organization_id: ORG_ID, application_id: appId,
      type: "hr", round: 2, title: "HR R2",
      scheduled_at: new Date("2026-04-15T10:00:00Z"), duration_minutes: 45,
      status: "completed", created_by: USER_ID,
    });
    cleanup.push({ table: "interviews", id: iid });

    const rid = uuidv4();
    await db("interview_recordings").insert({
      id: rid, organization_id: ORG_ID, interview_id: iid,
      file_path: "/recordings/hr-001.mp4", uploaded_by: USER_ID,
    });
    cleanup.push({ table: "interview_recordings", id: rid });

    const tid = uuidv4();
    await db("interview_transcripts").insert({
      id: tid, organization_id: ORG_ID, interview_id: iid, recording_id: rid,
      content: "Interviewer: Tell me about yourself...\nCandidate: I have 5 years...",
      summary: "Strong communication, good cultural fit", status: "completed",
      generated_at: new Date(),
    });
    cleanup.push({ table: "interview_transcripts", id: tid });

    const row = await db("interview_transcripts").where({ id: tid }).first();
    expect(row.status).toBe("completed");
    expect(row.content).toContain("Tell me about yourself");
  });
});
