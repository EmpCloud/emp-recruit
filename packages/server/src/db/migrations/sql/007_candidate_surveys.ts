import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Candidate Surveys
  await knex.schema.createTable("candidate_surveys", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    t.string("survey_type", 20).notNullable(); // post_interview, post_offer, post_rejection
    t.string("status", 20).notNullable().defaultTo("sent"); // sent, completed, expired
    t.timestamp("sent_at").defaultTo(knex.fn.now());
    t.timestamp("completed_at").nullable();
    t.string("token", 128).notNullable().unique(); // for anonymous access
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "survey_type"]);
    t.index(["token"]);
    t.index(["candidate_id"]);
  });

  // Candidate Survey Responses
  await knex.schema.createTable("candidate_survey_responses", (t) => {
    t.uuid("id").primary();
    t.uuid("survey_id").notNullable().references("id").inTable("candidate_surveys").onDelete("CASCADE");
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("question_key", 100).notNullable();
    t.integer("rating").nullable();
    t.text("text_response").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["survey_id"]);
    t.index(["organization_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("candidate_survey_responses");
  await knex.schema.dropTableIfExists("candidate_surveys");
}
