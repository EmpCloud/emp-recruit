import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Job Postings
  await knex.schema.createTable("job_postings", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("title", 200).notNullable();
    t.string("slug", 250).notNullable();
    t.string("department", 100).nullable();
    t.string("location", 200).nullable();
    t.string("employment_type", 50).defaultTo("full_time");
    t.integer("experience_min").nullable();
    t.integer("experience_max").nullable();
    t.bigInteger("salary_min").nullable();
    t.bigInteger("salary_max").nullable();
    t.string("salary_currency", 3).defaultTo("INR");
    t.text("description").notNullable();
    t.text("requirements").nullable();
    t.text("benefits").nullable();
    t.json("skills").nullable();
    t.string("status", 20).defaultTo("draft");
    t.timestamp("published_at").nullable();
    t.timestamp("closes_at").nullable();
    t.bigInteger("hiring_manager_id").unsigned().nullable();
    t.integer("max_applications").nullable();
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "status"]);
    t.index(["slug"]);
  });

  // Candidates
  await knex.schema.createTable("candidates", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("first_name", 64).notNullable();
    t.string("last_name", 64).notNullable();
    t.string("email", 128).notNullable();
    t.string("phone", 20).nullable();
    t.string("source", 20).defaultTo("direct");
    t.string("resume_path", 512).nullable();
    t.string("linkedin_url", 500).nullable();
    t.string("portfolio_url", 500).nullable();
    t.string("current_company", 200).nullable();
    t.string("current_title", 200).nullable();
    t.decimal("experience_years", 4, 1).nullable();
    t.json("skills").nullable();
    t.text("notes").nullable();
    t.json("tags").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "email"]);
  });

  // Applications
  await knex.schema.createTable("applications", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.string("stage", 20).defaultTo("applied");
    t.string("source", 20).defaultTo("direct");
    t.text("cover_letter").nullable();
    t.string("resume_path", 512).nullable();
    t.integer("rating").nullable();
    t.text("notes").nullable();
    t.string("rejection_reason", 500).nullable();
    t.timestamp("applied_at").defaultTo(knex.fn.now());
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "job_id"]);
    t.index(["organization_id", "stage"]);
    t.index(["candidate_id"]);
  });

  // Application Stage History
  await knex.schema.createTable("application_stage_history", (t) => {
    t.uuid("id").primary();
    t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    t.string("from_stage", 20).nullable();
    t.string("to_stage", 20).notNullable();
    t.bigInteger("changed_by").unsigned().notNullable();
    t.text("notes").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["application_id"]);
  });

  // Interviews
  await knex.schema.createTable("interviews", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    t.string("type", 20).notNullable();
    t.integer("round").defaultTo(1);
    t.string("title", 200).notNullable();
    t.timestamp("scheduled_at").notNullable();
    t.integer("duration_minutes").defaultTo(60);
    t.string("location", 500).nullable();
    t.string("meeting_link", 500).nullable();
    t.string("status", 20).defaultTo("scheduled");
    t.text("notes").nullable();
    t.bigInteger("created_by").unsigned().notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["application_id"]);
  });

  // Interview Panelists
  await knex.schema.createTable("interview_panelists", (t) => {
    t.uuid("id").primary();
    t.uuid("interview_id").notNullable().references("id").inTable("interviews").onDelete("CASCADE");
    t.bigInteger("user_id").unsigned().notNullable();
    t.string("role", 50).defaultTo("interviewer");
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["interview_id"]);
    t.index(["user_id"]);
  });

  // Interview Feedback
  await knex.schema.createTable("interview_feedback", (t) => {
    t.uuid("id").primary();
    t.uuid("interview_id").notNullable().references("id").inTable("interviews").onDelete("CASCADE");
    t.bigInteger("panelist_id").unsigned().notNullable();
    t.string("recommendation", 20).notNullable();
    t.integer("technical_score").nullable();
    t.integer("communication_score").nullable();
    t.integer("cultural_fit_score").nullable();
    t.integer("overall_score").nullable();
    t.text("strengths").nullable();
    t.text("weaknesses").nullable();
    t.text("notes").nullable();
    t.timestamp("submitted_at").defaultTo(knex.fn.now());
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["interview_id"]);
    t.index(["panelist_id"]);
  });

  // Offers
  await knex.schema.createTable("offers", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
    t.string("status", 30).defaultTo("draft");
    t.bigInteger("salary_amount").notNullable();
    t.string("salary_currency", 3).defaultTo("INR");
    t.date("joining_date").notNullable();
    t.date("expiry_date").notNullable();
    t.string("job_title", 200).notNullable();
    t.string("department", 100).nullable();
    t.text("benefits").nullable();
    t.text("notes").nullable();
    t.string("offer_letter_path", 512).nullable();
    t.bigInteger("created_by").unsigned().notNullable();
    t.bigInteger("approved_by").unsigned().nullable();
    t.timestamp("approved_at").nullable();
    t.timestamp("sent_at").nullable();
    t.timestamp("responded_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["application_id"]);
  });

  // Offer Approvers
  await knex.schema.createTable("offer_approvers", (t) => {
    t.uuid("id").primary();
    t.uuid("offer_id").notNullable().references("id").inTable("offers").onDelete("CASCADE");
    t.bigInteger("user_id").unsigned().notNullable();
    t.integer("order").defaultTo(0);
    t.string("status", 20).defaultTo("pending");
    t.text("notes").nullable();
    t.timestamp("acted_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["offer_id"]);
  });

  // Onboarding Templates
  await knex.schema.createTable("onboarding_templates", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.string("department", 100).nullable();
    t.boolean("is_default").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });

  // Onboarding Template Tasks
  await knex.schema.createTable("onboarding_template_tasks", (t) => {
    t.uuid("id").primary();
    t.uuid("template_id").notNullable().references("id").inTable("onboarding_templates").onDelete("CASCADE");
    t.string("title", 200).notNullable();
    t.text("description").nullable();
    t.string("category", 50).notNullable();
    t.string("assignee_role", 50).nullable();
    t.integer("due_days").defaultTo(0);
    t.integer("order").defaultTo(0);
    t.boolean("is_required").defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["template_id"]);
  });

  // Onboarding Checklists
  await knex.schema.createTable("onboarding_checklists", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.uuid("template_id").notNullable().references("id").inTable("onboarding_templates").onDelete("CASCADE");
    t.string("status", 20).defaultTo("not_started");
    t.timestamp("started_at").nullable();
    t.timestamp("completed_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["application_id"]);
  });

  // Onboarding Tasks
  await knex.schema.createTable("onboarding_tasks", (t) => {
    t.uuid("id").primary();
    t.uuid("checklist_id").notNullable().references("id").inTable("onboarding_checklists").onDelete("CASCADE");
    t.uuid("template_task_id").nullable();
    t.string("title", 200).notNullable();
    t.text("description").nullable();
    t.string("category", 50).notNullable();
    t.bigInteger("assignee_id").unsigned().nullable();
    t.date("due_date").nullable();
    t.string("status", 20).defaultTo("not_started");
    t.timestamp("completed_at").nullable();
    t.text("notes").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["checklist_id"]);
  });

  // Referrals
  await knex.schema.createTable("referrals", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
    t.bigInteger("referrer_id").unsigned().notNullable();
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.uuid("application_id").nullable().references("id").inTable("applications").onDelete("SET NULL");
    t.string("status", 20).defaultTo("submitted");
    t.string("relationship", 200).nullable();
    t.text("notes").nullable();
    t.bigInteger("bonus_amount").nullable();
    t.timestamp("bonus_paid_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["referrer_id"]);
  });

  // Email Templates
  await knex.schema.createTable("email_templates", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.string("trigger", 50).notNullable();
    t.string("subject", 500).notNullable();
    t.text("body").notNullable();
    t.boolean("is_active").defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "trigger"]);
  });

  // Career Pages
  await knex.schema.createTable("career_pages", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("slug", 100).notNullable().unique();
    t.string("title", 200).notNullable();
    t.text("description").nullable();
    t.string("logo_url", 500).nullable();
    t.string("banner_url", 500).nullable();
    t.string("primary_color", 7).defaultTo("#4F46E5");
    t.boolean("is_active").defaultTo(true);
    t.text("custom_css").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });

  // Recruitment Events (activity log)
  await knex.schema.createTable("recruitment_events", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("entity_type", 50).notNullable();
    t.uuid("entity_id").notNullable();
    t.string("action", 100).notNullable();
    t.bigInteger("actor_id").unsigned().notNullable();
    t.json("metadata").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "entity_type", "entity_id"]);
    t.index(["created_at"]);
  });

  // Audit Log
  await knex.schema.createTable("audit_logs", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.bigInteger("user_id").unsigned().notNullable();
    t.string("action", 100).notNullable();
    t.string("entity_type", 50).notNullable();
    t.uuid("entity_id").nullable();
    t.json("old_values").nullable();
    t.json("new_values").nullable();
    t.string("ip_address", 45).nullable();
    t.string("user_agent", 500).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "created_at"]);
    t.index(["entity_type", "entity_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    "audit_logs",
    "recruitment_events",
    "career_pages",
    "email_templates",
    "referrals",
    "onboarding_tasks",
    "onboarding_checklists",
    "onboarding_template_tasks",
    "onboarding_templates",
    "offer_approvers",
    "offers",
    "interview_feedback",
    "interview_panelists",
    "interviews",
    "application_stage_history",
    "applications",
    "candidates",
    "job_postings",
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
