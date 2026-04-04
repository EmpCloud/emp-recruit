// =============================================================================
// EMP RECRUIT SERVICE COVERAGE — Real DB Tests calling actual service functions
// Imports and invokes the real service functions instead of raw knex.
// Targets: offer, interview, assessment, onboarding, job, candidate,
//   application, pipeline, career-page, background-check, referral,
//   analytics, comparison, email, portal, scoring
// =============================================================================

// Set env vars BEFORE any imports (config reads at import time)
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "empcloud";
process.env.DB_PASSWORD = "EmpCloud2026";
process.env.DB_NAME = "emp_recruit";
process.env.EMPCLOUD_DB_HOST = "localhost";
process.env.EMPCLOUD_DB_USER = "empcloud";
process.env.EMPCLOUD_DB_PASSWORD = "EmpCloud2026";
process.env.EMPCLOUD_DB_NAME = "empcloud";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key";

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { initDB, closeDB, getDB } from "../../db/adapters";
import { initEmpCloudDB } from "../../db/empcloud";

// Services
import * as offerService from "../../services/offer/offer.service";
import * as offerLetterService from "../../services/offer/offer-letter.service";
import * as interviewService from "../../services/interview/interview.service";
import * as interviewCalendarService from "../../services/interview/calendar.service";
import * as assessmentService from "../../services/assessment/assessment.service";
import * as onboardingService from "../../services/onboarding/onboarding.service";
import * as jobService from "../../services/job/job.service";
import * as candidateService from "../../services/candidate/candidate.service";
import * as applicationService from "../../services/application/application.service";
import * as pipelineService from "../../services/pipeline/pipeline.service";
import * as careerPageService from "../../services/career-page/career-page.service";
import * as backgroundCheckService from "../../services/background-check/background-check.service";
import * as referralService from "../../services/referral/referral.service";
import * as analyticsService from "../../services/analytics/analytics.service";
import * as emailService from "../../services/email/email.service";

const ORG_ID = 5; // TechNova
const USER_ID = 522; // ananya (admin)

const db = getDB();
const cleanupIds: { table: string; id: string }[] = [];

function trackCleanup(table: string, id: string) {
  cleanupIds.push({ table, id });
}

beforeAll(async () => {
  await initDB();
  try { await initEmpCloudDB(); } catch { /* may already be initialized */ }
}, 30000);

afterEach(async () => {
  for (const item of cleanupIds.reverse()) {
    try { await db.delete(item.table, item.id); } catch { /* ignore */ }
  }
  cleanupIds.length = 0;
});

afterAll(async () => {
  await closeDB();
}, 10000);

// -- Job Service --------------------------------------------------------------

describe("JobService", () => {
  it("listJobs returns paginated results", async () => {
    const result = await jobService.listJobs(ORG_ID);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });

  it("CRUD: create, get, update, delete job", async () => {
    const job = await jobService.createJob(ORG_ID, {
      title: "SC Test Engineer",
      department: "Engineering",
      location: "Remote",
      type: "full_time",
      description: "Test job posting for service coverage",
      requirements: "Testing skills",
      minSalary: 50000,
      maxSalary: 100000,
      currency: "INR",
      postedBy: USER_ID,
    });
    expect(job).toHaveProperty("id");
    trackCleanup("job_postings", job.id);

    const fetched = await jobService.getJob(ORG_ID, job.id);
    expect(fetched).toHaveProperty("title", "SC Test Engineer");

    const updated = await jobService.updateJob(ORG_ID, job.id, {
      title: "SC Senior Test Engineer",
    });
    expect(updated).toHaveProperty("title", "SC Senior Test Engineer");

    await jobService.deleteJob(ORG_ID, job.id);
    cleanupIds.length = 0;
  });

  it("changeStatus updates job status", async () => {
    const job = await jobService.createJob(ORG_ID, {
      title: "SC Status Test Job",
      department: "QA",
      location: "Remote",
      type: "full_time",
      description: "Testing status changes",
      postedBy: USER_ID,
    });
    trackCleanup("job_postings", job.id);

    const updated = await jobService.changeStatus(ORG_ID, job.id, "published");
    expect(updated).toHaveProperty("status", "published");

    await jobService.deleteJob(ORG_ID, job.id);
    cleanupIds.length = 0;
  });
});

// -- Candidate Service --------------------------------------------------------

describe("CandidateService", () => {
  it("listCandidates returns paginated results", async () => {
    const result = await candidateService.listCandidates(ORG_ID);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });

  it("CRUD: create, get, update candidate", async () => {
    const candidate = await candidateService.createCandidate(ORG_ID, {
      firstName: "SC",
      lastName: "TestCandidate",
      email: `sc-test-${Date.now()}@example.com`,
      phone: "+91-9999999999",
      source: "direct",
    });
    expect(candidate).toHaveProperty("id");
    trackCleanup("candidates", candidate.id);

    const fetched = await candidateService.getCandidate(ORG_ID, candidate.id);
    expect(fetched).toHaveProperty("first_name", "SC");

    await candidateService.updateCandidate(ORG_ID, candidate.id, {
      lastName: "UpdatedCandidate",
    });
  });
});

// -- Application Service ------------------------------------------------------

describe("ApplicationService", () => {
  it("listApplications returns paginated results", async () => {
    const result = await applicationService.listApplications(ORG_ID);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });
});

// -- Pipeline Service ---------------------------------------------------------

describe("PipelineService", () => {
  it("getDefaultStages returns default stage list", () => {
    const stages = pipelineService.getDefaultStages();
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBeGreaterThan(0);
  });

  it("getOrgStages returns stages for org", async () => {
    const result = await pipelineService.getOrgStages(ORG_ID);
    expect(Array.isArray(result)).toBe(true);
  });

  it("CRUD: create, update, delete stage", async () => {
    const stage = await pipelineService.createStage(ORG_ID, {
      name: "SC Test Stage",
      order: 99,
      color: "#FF0000",
    });
    expect(stage).toHaveProperty("id");
    trackCleanup("pipeline_stages", stage.id);

    await pipelineService.updateStage(ORG_ID, stage.id, {
      name: "SC Updated Stage",
    });

    await pipelineService.deleteStage(ORG_ID, stage.id);
    cleanupIds.length = 0;
  });
});

// -- Offer Service ------------------------------------------------------------

describe("OfferService", () => {
  it("listOffers returns paginated results", async () => {
    const result = await offerService.listOffers(ORG_ID, {});
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });
});

// -- Offer Letter Service -----------------------------------------------------

describe("OfferLetterService", () => {
  it("listLetterTemplates returns array", async () => {
    const result = await offerLetterService.listLetterTemplates(ORG_ID);
    expect(Array.isArray(result)).toBe(true);
  });

  it("CRUD: create letter template", async () => {
    const tmpl = await offerLetterService.createLetterTemplate(ORG_ID, {
      name: "SC Test Offer Template",
      content: "<p>Dear {{candidate_name}}, we are pleased to offer...</p>",
    });
    expect(tmpl).toHaveProperty("id");
    trackCleanup("offer_letter_templates", tmpl.id);
  });
});

// -- Interview Service --------------------------------------------------------

describe("InterviewService", () => {
  it("listInterviews returns paginated results", async () => {
    const result = await interviewService.listInterviews(ORG_ID);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });
});

// -- Interview Calendar Service -----------------------------------------------

describe("InterviewCalendarService", () => {
  it("generateCalendarLinks returns google/outlook links", () => {
    const links = interviewCalendarService.generateCalendarLinks({
      title: "SC Test Interview",
      startTime: new Date("2026-06-01T10:00:00Z"),
      endTime: new Date("2026-06-01T11:00:00Z"),
      description: "Test interview",
      location: "Video Call",
    });
    expect(links).toHaveProperty("google");
    expect(links).toHaveProperty("outlook");
  });

  it("generateICSContent returns valid ICS string", () => {
    const ics = interviewCalendarService.generateICSContent({
      title: "SC Test ICS",
      startTime: new Date("2026-06-01T10:00:00Z"),
      endTime: new Date("2026-06-01T11:00:00Z"),
      description: "Test ICS generation",
      location: "Office",
    });
    expect(typeof ics).toBe("string");
    expect(ics).toContain("BEGIN:VCALENDAR");
  });
});

// -- Assessment Service -------------------------------------------------------

describe("AssessmentService", () => {
  it("listTemplates returns paginated results", async () => {
    const result = await assessmentService.listTemplates(ORG_ID);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
  });

  it("CRUD: create and get template", async () => {
    const tmpl = await assessmentService.createTemplate(ORG_ID, {
      name: "SC Test Assessment",
      type: "technical",
      duration: 60,
      passingScore: 70,
      questions: [
        { text: "What is TypeScript?", type: "text", points: 10 },
        {
          text: "Which is a JS runtime?",
          type: "multiple_choice",
          points: 5,
          options: ["Node.js", "Java", "C++"],
          correctAnswer: "Node.js",
        },
      ],
    });
    expect(tmpl).toHaveProperty("id");
    trackCleanup("assessment_templates", tmpl.id);

    const fetched = await assessmentService.getTemplate(ORG_ID, tmpl.id);
    expect(fetched).toHaveProperty("name", "SC Test Assessment");
  });
});

// -- Onboarding Service -------------------------------------------------------

describe("OnboardingService", () => {
  it("listTemplates returns paginated results", async () => {
    const result = await onboardingService.listTemplates(ORG_ID);
    expect(result).toHaveProperty("data");
  });

  it("CRUD: create, update, delete template", async () => {
    const tmpl = await onboardingService.createTemplate(ORG_ID, {
      name: "SC Test Onboarding Template",
      description: "For service coverage testing",
      department: "Engineering",
    });
    expect(tmpl).toHaveProperty("id");
    trackCleanup("onboarding_templates", tmpl.id);

    const updated = await onboardingService.updateTemplate(ORG_ID, tmpl.id, {
      name: "SC Updated Onboarding Template",
    });
    expect(updated).toHaveProperty("name", "SC Updated Onboarding Template");
  });

  it("addTemplateTask and removeTemplateTask work", async () => {
    const tmpl = await onboardingService.createTemplate(ORG_ID, {
      name: "SC Task Template",
      description: "Test tasks",
    });
    trackCleanup("onboarding_templates", tmpl.id);

    const task = await onboardingService.addTemplateTask(ORG_ID, tmpl.id, {
      title: "Complete paperwork",
      description: "Fill in all forms",
      assigneeRole: "hr",
      dueDay: 1,
    });
    expect(task).toHaveProperty("id");
    trackCleanup("onboarding_template_tasks", task.id);

    await onboardingService.removeTemplateTask(ORG_ID, task.id);
    cleanupIds.pop(); // already deleted
  });
});

// -- Career Page Service ------------------------------------------------------

describe("CareerPageService", () => {
  it("getConfig returns config or null", async () => {
    const result = await careerPageService.getConfig(ORG_ID);
    expect(result === null || typeof result === "object").toBe(true);
  });
});

// -- Background Check Service -------------------------------------------------

describe("BackgroundCheckService", () => {
  it("listPackages returns paginated results", async () => {
    const result = await backgroundCheckService.listPackages(ORG_ID);
    expect(result).toHaveProperty("data");
  });

  it("CRUD: create package", async () => {
    const pkg = await backgroundCheckService.createPackage(ORG_ID, {
      name: "SC Test Background Package",
      checks: ["identity", "education"],
      provider: "internal",
      price: 5000,
    });
    expect(pkg).toHaveProperty("id");
    trackCleanup("background_check_packages", pkg.id);
  });

  it("listAllChecks returns paginated results", async () => {
    const result = await backgroundCheckService.listAllChecks(ORG_ID);
    expect(result).toHaveProperty("data");
  });
});

// -- Referral Service ---------------------------------------------------------

describe("ReferralService", () => {
  it("listReferrals returns paginated results", async () => {
    const result = await referralService.listReferrals(ORG_ID);
    expect(result).toHaveProperty("data");
  });
});

// -- Analytics Service --------------------------------------------------------

describe("AnalyticsService", () => {
  it("getDashboard returns dashboard data", async () => {
    const result = await analyticsService.getDashboard(ORG_ID);
    expect(result).toBeDefined();
  });

  it("getPipelineFunnel returns funnel data", async () => {
    const result = await analyticsService.getPipelineFunnel(ORG_ID);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getTimeToHire returns hiring metrics", async () => {
    const result = await analyticsService.getTimeToHire(ORG_ID);
    expect(result).toBeDefined();
  });

  it("getSourceEffectiveness returns source data", async () => {
    const result = await analyticsService.getSourceEffectiveness(ORG_ID);
    expect(Array.isArray(result)).toBe(true);
  });
});

// -- Email Service ------------------------------------------------------------

describe("EmailService", () => {
  it("listTemplates returns array", async () => {
    const result = await emailService.listTemplates(ORG_ID);
    expect(Array.isArray(result)).toBe(true);
  });

  it("CRUD: create, get, update template", async () => {
    const tmpl = await emailService.createTemplate(ORG_ID, {
      name: "SC Test Email Template",
      subject: "Welcome {{candidate_name}}",
      body: "<p>Welcome to our team!</p>",
      type: "offer",
    });
    expect(tmpl).toHaveProperty("id");
    trackCleanup("email_templates", tmpl.id);

    const fetched = await emailService.getTemplateById(ORG_ID, tmpl.id);
    expect(fetched).toHaveProperty("name", "SC Test Email Template");

    const updated = await emailService.updateTemplate(ORG_ID, tmpl.id, {
      name: "SC Updated Email Template",
    });
    expect(updated).toHaveProperty("name", "SC Updated Email Template");
  });

  it("renderTemplate substitutes variables", () => {
    const result = emailService.renderTemplate(
      "Hello {{name}}, welcome to {{company}}",
      { name: "Alice", company: "TechNova" }
    );
    expect(result).toBe("Hello Alice, welcome to TechNova");
  });
});
