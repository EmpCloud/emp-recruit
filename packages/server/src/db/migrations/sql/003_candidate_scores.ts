import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("candidate_scores", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    t.uuid("candidate_id").notNullable();
    t.uuid("job_id").notNullable();
    t.integer("overall_score").unsigned().notNullable();
    t.integer("skills_score").unsigned().notNullable();
    t.integer("experience_score").unsigned().notNullable();
    t.json("matched_skills").nullable();
    t.json("missing_skills").nullable();
    t.enum("recommendation", ["strong_match", "good_match", "partial_match", "weak_match"]).notNullable();
    t.timestamp("scored_at").notNullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "job_id"]);
    t.index(["application_id"]);
    t.index(["candidate_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("candidate_scores");
}
