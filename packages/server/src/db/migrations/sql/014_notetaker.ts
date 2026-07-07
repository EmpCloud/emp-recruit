// ============================================================================
// MIGRATION 014 — AI Interview Notetaker
//
// Tracks a notetaker bot that joins an interview meeting, records/transcribes,
// and produces an AI evaluation. Vendor-agnostic (Recall.ai is the reference
// implementation). One session per interview:
//   requested -> joining -> recording -> transcribing -> completed | failed
// The transcript + Claude evaluation are stored on the row.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("interview_notetaker_sessions"))) {
    await knex.schema.createTable("interview_notetaker_sessions", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("interview_id").notNullable().references("id").inTable("interviews").onDelete("CASCADE");
      t.string("provider", 30).notNullable().defaultTo("recall"); // recall | ...
      t.string("external_bot_id", 191).nullable(); // vendor's bot/session id
      t.string("status", 20).notNullable().defaultTo("requested");
      // requested | joining | recording | transcribing | completed | failed
      t.string("meeting_url", 500).nullable();
      t.specificType("transcript", "LONGTEXT").nullable(); // full transcript text
      t.specificType("transcript_json", "LONGTEXT").nullable(); // structured (speakers/timestamps)
      t.integer("duration_seconds").nullable();
      t.text("error").nullable();
      // AI evaluation (Claude) derived from the transcript.
      t.integer("ai_score").nullable(); // 0-100 candidate evaluation
      t.string("ai_recommendation", 30).nullable(); // strong_hire | hire | no_hire | strong_no_hire
      t.specificType("ai_summary", "LONGTEXT").nullable();
      t.specificType("ai_analysis_json", "LONGTEXT").nullable(); // strengths, concerns, per-competency
      t.timestamp("completed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "interview_id"]);
      t.index(["external_bot_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("interview_notetaker_sessions");
}
