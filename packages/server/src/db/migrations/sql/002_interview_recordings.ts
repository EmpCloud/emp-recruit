import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Interview Recordings
  await knex.schema.createTable("interview_recordings", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("interview_id").notNullable().references("id").inTable("interviews").onDelete("CASCADE");
    t.string("file_path", 512).notNullable();
    t.bigInteger("file_size").nullable();
    t.integer("duration_seconds").nullable();
    t.string("mime_type", 100).nullable();
    t.bigInteger("uploaded_by").unsigned().notNullable();
    t.timestamp("uploaded_at").defaultTo(knex.fn.now());
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "interview_id"]);
  });

  // Interview Transcripts
  await knex.schema.createTable("interview_transcripts", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("interview_id").notNullable().references("id").inTable("interviews").onDelete("CASCADE");
    t.uuid("recording_id").nullable().references("id").inTable("interview_recordings").onDelete("SET NULL");
    t.text("content").notNullable();
    t.text("summary").nullable();
    t.enum("status", ["processing", "completed", "failed"]).defaultTo("completed");
    t.timestamp("generated_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id", "interview_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("interview_transcripts");
  await knex.schema.dropTableIfExists("interview_recordings");
}
