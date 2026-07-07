// ============================================================================
// MIGRATION 013 — Job Distribution
//
// Tracks where each job posting was published (Naukri, LinkedIn, Indeed, Apna,
// …) and the result. Naukri uses the "assisted post" model (we generate a
// pre-filled payload the recruiter submits), so a distribution can be in
// 'prepared' state before it's 'posted'. Portal-API adapters (LinkedIn/Indeed)
// go straight to 'posted' once their credentials exist.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("job_distributions"))) {
    await knex.schema.createTable("job_distributions", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.uuid("job_id").notNullable().references("id").inTable("job_postings").onDelete("CASCADE");
      // naukri | linkedin | indeed | apna | ...
      t.string("portal", 30).notNullable();
      // prepared (payload ready for assisted post) | posted | failed | removed
      t.string("status", 20).notNullable().defaultTo("prepared");
      // The portal's own posting id / URL, once live.
      t.string("external_id", 191).nullable();
      t.string("external_url", 500).nullable();
      // The prepared payload / prefill data (JSON) for assisted posting.
      t.text("payload").nullable();
      t.text("error").nullable();
      t.bigInteger("created_by").unsigned().nullable();
      t.timestamp("posted_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.unique(["job_id", "portal"]);
      t.index(["organization_id", "job_id"]);
    });
  }

  // Per-org portal credentials (for API portals — LinkedIn/Indeed once granted).
  // Naukri needs none (assisted). Kept generic so any portal can store its keys.
  if (!(await knex.schema.hasTable("portal_credentials"))) {
    await knex.schema.createTable("portal_credentials", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.string("portal", 30).notNullable();
      t.text("credentials").nullable(); // JSON — API key / OAuth tokens per portal
      t.string("status", 20).notNullable().defaultTo("connected");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.unique(["organization_id", "portal"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("portal_credentials");
  await knex.schema.dropTableIfExists("job_distributions");
}
