// =============================================================================
// RECRUIT MISC DEEP — onboarding, referrals, career page, email templates, analytics
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

// ==========================================================================
// ONBOARDING TEMPLATES & CHECKLISTS
// ==========================================================================
describe("Onboarding Templates", () => {
  it("should create an onboarding template with tasks", async () => {
    const tmplId = uuidv4();
    await db("onboarding_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Onboard-${TS}`,
      description: "Standard onboarding", department: "Engineering", is_default: true,
    });
    cleanup.push({ table: "onboarding_templates", id: tmplId });

    const t1 = uuidv4();
    const t2 = uuidv4();
    const t3 = uuidv4();
    await db("onboarding_template_tasks").insert([
      { id: t1, template_id: tmplId, title: "Setup laptop", category: "IT", assignee_role: "it_admin", due_days: 1, order: 1, is_required: true },
      { id: t2, template_id: tmplId, title: "Sign NDA", category: "Legal", assignee_role: "hr_admin", due_days: 0, order: 2, is_required: true },
      { id: t3, template_id: tmplId, title: "Welcome lunch", category: "Social", due_days: 3, order: 3, is_required: false },
    ]);
    cleanup.push({ table: "onboarding_template_tasks", id: t1 });
    cleanup.push({ table: "onboarding_template_tasks", id: t2 });
    cleanup.push({ table: "onboarding_template_tasks", id: t3 });

    const tasks = await db("onboarding_template_tasks").where({ template_id: tmplId }).orderBy("order");
    expect(tasks.length).toBe(3);
    expect(tasks[0].title).toBe("Setup laptop");
  });

  it("should update an onboarding template", async () => {
    const tmplId = uuidv4();
    await db("onboarding_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Old-${TS}`,
      department: "HR", is_default: false,
    });
    cleanup.push({ table: "onboarding_templates", id: tmplId });

    await db("onboarding_templates").where({ id: tmplId }).update({ name: `Updated-${TS}` });
    const row = await db("onboarding_templates").where({ id: tmplId }).first();
    expect(row.name).toBe(`Updated-${TS}`);
  });
});

describe("Onboarding Checklists", () => {
  it("should generate a checklist from template and track completion", async () => {
    const tmplId = uuidv4();
    await db("onboarding_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Gen-${TS}`, is_default: false,
    });
    cleanup.push({ table: "onboarding_templates", id: tmplId });

    const tt1 = uuidv4();
    await db("onboarding_template_tasks").insert({
      id: tt1, template_id: tmplId, title: "Create email", category: "IT", due_days: 1, order: 1, is_required: true,
    });
    cleanup.push({ table: "onboarding_template_tasks", id: tt1 });

    // Simulate generating checklist for a hired candidate
    const candId = uuidv4();
    await db("candidates").insert({
      id: candId, organization_id: ORG_ID, first_name: "New", last_name: "Hire",
      email: `newhire-${TS}@test.com`, source: "direct",
    });
    cleanup.push({ table: "candidates", id: candId });

    const jobId = uuidv4();
    await db("job_postings").insert({
      id: jobId, organization_id: ORG_ID, title: `OB-Job-${TS}`, slug: `ob-job-${jobId}`,
      description: "Test ob job", status: "published", created_by: USER_ID, employment_type: "full_time",
    });
    cleanup.push({ table: "job_postings", id: jobId });

    const appId = uuidv4();
    await db("applications").insert({
      id: appId, organization_id: ORG_ID, job_id: jobId, candidate_id: candId,
      stage: "hired",
    });
    cleanup.push({ table: "applications", id: appId });

    const clId = uuidv4();
    await db("onboarding_checklists").insert({
      id: clId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, template_id: tmplId, status: "not_started",
    });
    cleanup.push({ table: "onboarding_checklists", id: clId });

    const taskId = uuidv4();
    await db("onboarding_tasks").insert({
      id: taskId, checklist_id: clId, template_task_id: tt1,
      title: "Create email", category: "IT", status: "not_started",
      due_date: "2026-05-02",
    });
    cleanup.push({ table: "onboarding_tasks", id: taskId });

    // Complete the task
    await db("onboarding_tasks").where({ id: taskId }).update({
      status: "completed", completed_at: new Date(), notes: "Done by IT",
    });

    const task = await db("onboarding_tasks").where({ id: taskId }).first();
    expect(task.status).toBe("completed");

    // Update checklist status
    const allTasks = await db("onboarding_tasks").where({ checklist_id: clId });
    const allDone = allTasks.every((t: any) => t.status === "completed");
    if (allDone) {
      await db("onboarding_checklists").where({ id: clId }).update({
        status: "completed", completed_at: new Date(),
      });
    }

    const cl = await db("onboarding_checklists").where({ id: clId }).first();
    expect(cl.status).toBe("completed");
  });
});

// ==========================================================================
// REFERRALS
// ==========================================================================
describe("Referrals", () => {
  it("should create a referral", async () => {
    const candId = uuidv4();
    await db("candidates").insert({
      id: candId, organization_id: ORG_ID, first_name: `Ref-${TS}`, last_name: "Test",
      email: `ref-${TS}@test.com`, source: "referral",
    });
    cleanup.push({ table: "candidates", id: candId });

    const jobId = uuidv4();
    await db("job_postings").insert({
      id: jobId, organization_id: ORG_ID, title: `Ref-Job-${TS}`, slug: `ref-job-${jobId}`,
      description: "Test ref job", status: "published", created_by: USER_ID, employment_type: "full_time",
    });
    cleanup.push({ table: "job_postings", id: jobId });

    const refId = uuidv4();
    await db("referrals").insert({
      id: refId, organization_id: ORG_ID, job_id: jobId,
      referrer_id: USER_ID, candidate_id: candId,
      status: "submitted", relationship: "Former colleague",
      notes: "Strong React developer",
    });
    cleanup.push({ table: "referrals", id: refId });

    const row = await db("referrals").where({ id: refId }).first();
    expect(row.status).toBe("submitted");
    expect(row.relationship).toBe("Former colleague");
  });

  it("should pay referral bonus after hire", async () => {
    const candId = uuidv4();
    await db("candidates").insert({
      id: candId, organization_id: ORG_ID, first_name: `Bonus-${TS}`, last_name: "Test",
      email: `bonus-${TS}@test.com`, source: "referral",
    });
    cleanup.push({ table: "candidates", id: candId });

    const jobId = uuidv4();
    await db("job_postings").insert({
      id: jobId, organization_id: ORG_ID, title: `Bonus-Job-${TS}`, slug: `bonus-job-${jobId}`,
      description: "Test bonus job", status: "published", created_by: USER_ID, employment_type: "full_time",
    });
    cleanup.push({ table: "job_postings", id: jobId });

    const refId = uuidv4();
    await db("referrals").insert({
      id: refId, organization_id: ORG_ID, job_id: jobId,
      referrer_id: USER_ID, candidate_id: candId,
      status: "hired", bonus_amount: 5000000, bonus_paid_at: new Date(),
    });
    cleanup.push({ table: "referrals", id: refId });

    const row = await db("referrals").where({ id: refId }).first();
    expect(row.status).toBe("hired");
    expect(Number(row.bonus_amount)).toBe(5000000);
    expect(row.bonus_paid_at).toBeTruthy();
  });

  it("should track referral status lifecycle", async () => {
    const candId = uuidv4();
    await db("candidates").insert({
      id: candId, organization_id: ORG_ID, first_name: `Life-${TS}`, last_name: "Test",
      email: `life-${TS}@test.com`, source: "referral",
    });
    cleanup.push({ table: "candidates", id: candId });

    const jobId = uuidv4();
    await db("job_postings").insert({
      id: jobId, organization_id: ORG_ID, title: `Life-Job-${TS}`, slug: `life-job-${jobId}`,
      description: "Test life job", status: "published", created_by: USER_ID, employment_type: "full_time",
    });
    cleanup.push({ table: "job_postings", id: jobId });

    const refId = uuidv4();
    await db("referrals").insert({
      id: refId, organization_id: ORG_ID, job_id: jobId,
      referrer_id: USER_ID, candidate_id: candId, status: "submitted",
    });
    cleanup.push({ table: "referrals", id: refId });

    for (const status of ["screening", "interviewing", "hired"]) {
      await db("referrals").where({ id: refId }).update({ status });
      const row = await db("referrals").where({ id: refId }).first();
      expect(row.status).toBe(status);
    }
  });
});

// ==========================================================================
// CAREER PAGES
// ==========================================================================
describe("Career Pages", () => {
  it("should create a career page with branding", async () => {
    const slug = `careers-${TS}`;
    const id = uuidv4();
    await db("career_pages").insert({
      id, organization_id: ORG_ID, slug,
      title: `TechNova Careers-${TS}`, description: "Join our team!",
      primary_color: "#4F46E5", is_active: true,
    });
    cleanup.push({ table: "career_pages", id });

    const row = await db("career_pages").where({ id }).first();
    expect(row.slug).toBe(slug);
    expect(row.primary_color).toBe("#4F46E5");
  });

  it("should update career page with logo and banner", async () => {
    const id = uuidv4();
    await db("career_pages").insert({
      id, organization_id: ORG_ID, slug: `up-${TS}`,
      title: `Update-${TS}`, is_active: true,
    });
    cleanup.push({ table: "career_pages", id });

    await db("career_pages").where({ id }).update({
      logo_url: "/logos/technova.png", banner_url: "/banners/technova.jpg",
      custom_css: "body { font-family: Inter; }",
    });

    const row = await db("career_pages").where({ id }).first();
    expect(row.logo_url).toBe("/logos/technova.png");
    expect(row.custom_css).toContain("Inter");
  });
});

// ==========================================================================
// EMAIL TEMPLATES
// ==========================================================================
describe("Email Templates", () => {
  it("should create email templates for different triggers", async () => {
    const triggers = ["application_received", "interview_scheduled", "offer_sent", "rejection"];
    const ids: string[] = [];

    for (const trigger of triggers) {
      const id = uuidv4();
      await db("email_templates").insert({
        id, organization_id: ORG_ID, name: `${trigger}-${TS}`,
        trigger, subject: `Your ${trigger.replace("_", " ")}`,
        body: `<p>Dear {{candidate_name}}, regarding your ${trigger}...</p>`,
        is_active: true,
      });
      ids.push(id);
      cleanup.push({ table: "email_templates", id });
    }

    const rows = await db("email_templates")
      .where({ organization_id: ORG_ID })
      .whereIn("id", ids);
    expect(rows.length).toBe(4);
  });

  it("should update email template", async () => {
    const id = uuidv4();
    await db("email_templates").insert({
      id, organization_id: ORG_ID, name: `Old-${TS}`,
      trigger: "custom", subject: "Old subject",
      body: "<p>Old body</p>", is_active: true,
    });
    cleanup.push({ table: "email_templates", id });

    await db("email_templates").where({ id }).update({
      subject: "Updated subject", body: "<p>Updated body</p>",
    });

    const row = await db("email_templates").where({ id }).first();
    expect(row.subject).toBe("Updated subject");
  });
});

// ==========================================================================
// ANALYTICS
// ==========================================================================
describe("Analytics Queries", () => {
  it("should count applications by stage", async () => {
    const rows = await db("applications")
      .where({ organization_id: ORG_ID })
      .select("stage")
      .count("* as count")
      .groupBy("stage");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("should count candidates by source", async () => {
    const rows = await db("candidates")
      .where({ organization_id: ORG_ID })
      .select("source")
      .count("* as count")
      .groupBy("source");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("should count interviews by status", async () => {
    const rows = await db("interviews")
      .where({ organization_id: ORG_ID })
      .select("status")
      .count("* as count")
      .groupBy("status");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("should compute pipeline stage history", async () => {
    const rows = await db("application_stage_history")
      .select("from_stage", "to_stage")
      .count("* as count")
      .groupBy("from_stage", "to_stage")
      .limit(50);
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ==========================================================================
// RECRUITMENT EVENTS (Audit Log)
// ==========================================================================
describe("Recruitment Events (Audit Log)", () => {
  it("should log a recruitment event", async () => {
    const id = uuidv4();
    await db("recruitment_events").insert({
      id, organization_id: ORG_ID, entity_type: "application",
      entity_id: uuidv4(), action: "stage_changed", actor_id: USER_ID,
      metadata: JSON.stringify({ from: "screening", to: "interview" }),
    });
    cleanup.push({ table: "recruitment_events", id });

    const row = await db("recruitment_events").where({ id }).first();
    expect(row.action).toBe("stage_changed");
    const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    expect(meta.to).toBe("interview");
  });
});
