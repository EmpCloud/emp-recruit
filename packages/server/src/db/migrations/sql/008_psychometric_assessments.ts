import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Assessment Templates
  await knex.schema.createTable("assessment_templates", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.string("assessment_type", 20).notNullable(); // behavioral, cognitive, personality, situational
    t.integer("time_limit_minutes").nullable();
    t.json("questions").notNullable(); // array of {question, options, type, correct_answer}
    t.boolean("is_active").defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "assessment_type"]);
  });

  // Candidate Assessments
  await knex.schema.createTable("candidate_assessments", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.uuid("template_id").notNullable().references("id").inTable("assessment_templates").onDelete("CASCADE");
    t.string("status", 20).notNullable().defaultTo("invited"); // invited, started, completed, expired
    t.string("token", 128).notNullable().unique(); // for anonymous access
    t.timestamp("started_at").nullable();
    t.timestamp("completed_at").nullable();
    t.integer("score").nullable();
    t.integer("max_score").nullable();
    t.decimal("percentile", 5, 2).nullable();
    t.json("result_summary").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["candidate_id"]);
    t.index(["token"]);
  });

  // Assessment Responses
  await knex.schema.createTable("assessment_responses", (t) => {
    t.uuid("id").primary();
    t.uuid("assessment_id").notNullable().references("id").inTable("candidate_assessments").onDelete("CASCADE");
    t.bigInteger("organization_id").unsigned().notNullable();
    t.integer("question_index").notNullable();
    t.text("answer").notNullable();
    t.boolean("is_correct").nullable();
    t.integer("time_taken_seconds").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["assessment_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("assessment_responses");
  await knex.schema.dropTableIfExists("candidate_assessments");
  await knex.schema.dropTableIfExists("assessment_templates");
}
