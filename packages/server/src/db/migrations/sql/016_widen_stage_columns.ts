// ============================================================================
// MIGRATION 016 — Widen application stage columns for custom pipeline stages
// ============================================================================
// Custom pipeline stage slugs are varchar(100) (pipeline_stages.slug), but the
// columns that store an application's current/historical stage were varchar(20)
// — so moving a candidate into a custom stage with a slug longer than 20 chars
// would truncate or error. Widen them to varchar(100) to match.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Preserve each column's existing nullability/default; only widen the size.
  await knex.raw("ALTER TABLE applications MODIFY COLUMN stage VARCHAR(100) DEFAULT 'applied'");
  await knex.raw("ALTER TABLE application_stage_history MODIFY COLUMN to_stage VARCHAR(100) NOT NULL");
  await knex.raw("ALTER TABLE application_stage_history MODIFY COLUMN from_stage VARCHAR(100) NULL");
}

export async function down(knex: Knex): Promise<void> {
  // Revert to varchar(20) (may truncate custom-stage data if any exists).
  await knex.raw("ALTER TABLE applications MODIFY COLUMN stage VARCHAR(20) DEFAULT 'applied'");
  await knex.raw("ALTER TABLE application_stage_history MODIFY COLUMN to_stage VARCHAR(20) NOT NULL");
  await knex.raw("ALTER TABLE application_stage_history MODIFY COLUMN from_stage VARCHAR(20) NULL");
}
