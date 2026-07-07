// ============================================================================
// MIGRATION 017 — Add report_json to candidate_scores
// ============================================================================
// Stores the full AI reasoning behind a score (per-dimension reasoning,
// strengths, concerns) so the AI Score Report can explain WHY a candidate got
// their score, not just show the number. Nullable JSON so heuristic/legacy
// scores are unaffected.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("candidate_scores", "report_json");
  if (!has) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.text("report_json").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn("candidate_scores", "report_json");
  if (has) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.dropColumn("report_json");
    });
  }
}
