// ============================================================================
// MIGRATION 009 — Add remote_policy to job_postings
// ============================================================================
// The Job Create form has had a Remote Policy select from day one
// (onsite / remote / hybrid) but the value was silently dropped: no
// column in the DB, no field in the zod schema, no SELECT in the list
// response. That's the root of #30 (field "always selects On-site" — it
// doesn't actually store anything) and #32 (field doesn't appear on
// the job card — because it was never stored).
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("job_postings", "remote_policy");
  if (!hasColumn) {
    await knex.schema.alterTable("job_postings", (t) => {
      t.string("remote_policy", 20).notNullable().defaultTo("onsite");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("job_postings", "remote_policy");
  if (hasColumn) {
    await knex.schema.alterTable("job_postings", (t) => {
      t.dropColumn("remote_policy");
    });
  }
}
