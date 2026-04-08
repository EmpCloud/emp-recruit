// =============================================================================
// RECRUIT OFFER DEEP — full lifecycle: create->approve->send->accept->decline->revoke
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

async function seedJobAndApp(): Promise<{ jobId: string; candId: string; appId: string }> {
  const jobId = uuidv4();
  await db("job_postings").insert({
    id: jobId, organization_id: ORG_ID, title: `Offer-Job-${TS}`, slug: `offer-job-${jobId}`,
    description: "Test offer job", department: "Engineering",
    status: "published", created_by: USER_ID,
    location: "Bangalore", employment_type: "full_time",
  });
  cleanup.push({ table: "job_postings", id: jobId });

  const candId = uuidv4();
  await db("candidates").insert({
    id: candId, organization_id: ORG_ID, first_name: `Offer-${TS}`, last_name: "Candidate",
    email: `offer-${TS}@test.com`, source: "referral",
  });
  cleanup.push({ table: "candidates", id: candId });

  const appId = uuidv4();
  await db("applications").insert({
    id: appId, organization_id: ORG_ID, job_id: jobId, candidate_id: candId,
    stage: "screening",
  });
  cleanup.push({ table: "applications", id: appId });

  return { jobId, candId, appId };
}

// ==========================================================================
// OFFER CRUD
// ==========================================================================
describe("Offer CRUD", () => {
  it("should create a draft offer", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "draft", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Software Engineer", department: "Engineering",
      benefits: "Health insurance, WFH", created_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("draft");
    expect(Number(row.salary_amount)).toBe(12000000);
    expect(row.job_title).toBe("Software Engineer");
  });

  it("should update a draft offer", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "draft", salary_amount: 10000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Junior Dev", created_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    await db("offers").where({ id: offerId }).update({
      salary_amount: 15000000, job_title: "Senior Dev",
    });

    const row = await db("offers").where({ id: offerId }).first();
    expect(Number(row.salary_amount)).toBe(15000000);
    expect(row.job_title).toBe("Senior Dev");
  });
});

// ==========================================================================
// OFFER APPROVAL WORKFLOW
// ==========================================================================
describe("Offer Approval Workflow", () => {
  it("should submit for approval with approvers", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "draft", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    // Add approvers
    const a1 = uuidv4();
    const a2 = uuidv4();
    await db("offer_approvers").insert([
      { id: a1, offer_id: offerId, user_id: 522, order: 1, status: "pending" },
      { id: a2, offer_id: offerId, user_id: 524, order: 2, status: "pending" },
    ]);
    cleanup.push({ table: "offer_approvers", id: a1 });
    cleanup.push({ table: "offer_approvers", id: a2 });

    await db("offers").where({ id: offerId }).update({ status: "pending_approval" });

    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("pending_approval");
    const approvers = await db("offer_approvers").where({ offer_id: offerId }).orderBy("order");
    expect(approvers.length).toBe(2);
  });

  it("should approve offer after all approvers approve", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "pending_approval", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    const a1 = uuidv4();
    await db("offer_approvers").insert({ id: a1, offer_id: offerId, user_id: 522, order: 1, status: "pending" });
    cleanup.push({ table: "offer_approvers", id: a1 });

    // Approve
    await db("offer_approvers").where({ id: a1 }).update({
      status: "approved", acted_at: new Date(), notes: "Looks good",
    });

    // Check if all approved
    const pending = await db("offer_approvers").where({ offer_id: offerId, status: "pending" }).count("* as cnt").first();
    if (Number(pending?.cnt) === 0) {
      await db("offers").where({ id: offerId }).update({
        status: "approved", approved_by: 522, approved_at: new Date(),
      });
    }

    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("approved");
  });

  it("should reject offer (single rejection rejects whole offer)", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "pending_approval", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    const a1 = uuidv4();
    await db("offer_approvers").insert({ id: a1, offer_id: offerId, user_id: 524, order: 1, status: "pending" });
    cleanup.push({ table: "offer_approvers", id: a1 });

    await db("offer_approvers").where({ id: a1 }).update({
      status: "rejected", acted_at: new Date(), notes: "Salary too high",
    });
    await db("offers").where({ id: offerId }).update({ status: "draft" });

    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("draft");
  });
});

// ==========================================================================
// OFFER SEND / ACCEPT / DECLINE / REVOKE
// ==========================================================================
describe("Offer Send/Accept/Decline/Revoke", () => {
  it("should send an approved offer", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "approved", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID, approved_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    await db("offers").where({ id: offerId }).update({ status: "sent", sent_at: new Date() });
    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("sent");
    expect(row.sent_at).toBeTruthy();
  });

  it("should accept a sent offer and move app to hired", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "sent", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID, sent_at: new Date(),
    });
    cleanup.push({ table: "offers", id: offerId });

    await db("offers").where({ id: offerId }).update({
      status: "accepted", responded_at: new Date(),
    });
    await db("applications").where({ id: appId }).update({ stage: "hired" });

    const offer = await db("offers").where({ id: offerId }).first();
    expect(offer.status).toBe("accepted");
    const app = await db("applications").where({ id: appId }).first();
    expect(app.stage).toBe("hired");
  });

  it("should decline a sent offer", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "sent", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID, sent_at: new Date(),
    });
    cleanup.push({ table: "offers", id: offerId });

    await db("offers").where({ id: offerId }).update({
      status: "declined", responded_at: new Date(), notes: "Accepted another offer",
    });

    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("declined");
  });

  it("should revoke a sent offer", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "sent", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID, sent_at: new Date(),
    });
    cleanup.push({ table: "offers", id: offerId });

    await db("offers").where({ id: offerId }).update({ status: "revoked" });
    const row = await db("offers").where({ id: offerId }).first();
    expect(row.status).toBe("revoked");
  });
});

// ==========================================================================
// OFFER LETTER TEMPLATES & GENERATION
// ==========================================================================
describe("Offer Letter Templates", () => {
  it("should create an offer letter template", async () => {
    const id = uuidv4();
    await db("offer_letter_templates").insert({
      id, organization_id: ORG_ID, name: `OfferTmpl-${TS}`,
      content_template: "Dear {{candidate.name}}, we are pleased to offer you...",
      is_default: true, is_active: true,
    });
    cleanup.push({ table: "offer_letter_templates", id });

    const row = await db("offer_letter_templates").where({ id }).first();
    expect(row.content_template).toContain("{{candidate.name}}");
  });

  it("should generate an offer letter", async () => {
    const { jobId, candId, appId } = await seedJobAndApp();
    const offerId = uuidv4();
    await db("offers").insert({
      id: offerId, organization_id: ORG_ID, application_id: appId,
      candidate_id: candId, job_id: jobId,
      status: "approved", salary_amount: 12000000, salary_currency: "INR",
      joining_date: "2026-05-01", expiry_date: "2026-04-20",
      job_title: "Engineer", created_by: USER_ID,
    });
    cleanup.push({ table: "offers", id: offerId });

    const tmplId = uuidv4();
    await db("offer_letter_templates").insert({
      id: tmplId, organization_id: ORG_ID, name: `Gen-${TS}`,
      content_template: "Dear Candidate...", is_default: false, is_active: true,
    });
    cleanup.push({ table: "offer_letter_templates", id: tmplId });

    const glId = uuidv4();
    await db("generated_offer_letters").insert({
      id: glId, organization_id: ORG_ID, offer_id: offerId, template_id: tmplId,
      content: "Dear Offer-Test Candidate, we are pleased...",
      generated_by: USER_ID,
    });
    cleanup.push({ table: "generated_offer_letters", id: glId });

    const row = await db("generated_offer_letters").where({ id: glId }).first();
    expect(row.content).toContain("pleased");
  });
});
