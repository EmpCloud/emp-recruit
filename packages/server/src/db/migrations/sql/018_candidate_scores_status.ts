// ============================================================================
// MIGRATION 018 — Add status to candidate_scores
// ============================================================================
// AI scoring can take ~30-90s with a reasoning model, so it runs in the
// background. `status` lets the UI show "scoring…" and poll for completion:
//   pending → processing → completed | failed
// Defaults to 'completed' so existing rows (already scored) are unaffected.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("candidate_scores", "status");
  if (!has) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.string("status", 20).notNullable().defaultTo("completed");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("candidate_scores", "status");
  if (has) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.dropColumn("status");
    });
  }
}
