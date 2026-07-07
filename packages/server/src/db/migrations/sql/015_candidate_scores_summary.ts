// ============================================================================
// MIGRATION 015 — Add ai_summary to candidate_scores
// ============================================================================
// The AI scorer produces a short recruiter-facing rationale ("Strong backend
// match: 3 yrs Node.js, missing Kubernetes…"). Persist it so the score report
// and rankings can show *why* a candidate scored the way they did, not just the
// number. Nullable so existing rows and the heuristic path are unaffected.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("candidate_scores", "ai_summary");
  if (!hasColumn) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.text("ai_summary").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("candidate_scores", "ai_summary");
  if (hasColumn) {
    await knex.schema.alterTable("candidate_scores", (t) => {
      t.dropColumn("ai_summary");
    });
  }
}
