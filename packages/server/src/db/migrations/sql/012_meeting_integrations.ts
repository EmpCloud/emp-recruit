// ============================================================================
// MIGRATION 012 — Meeting Integrations (OAuth)
//
// Stores per-organization OAuth connections to Google (Meet), Microsoft (Teams),
// and Zoom, so interviews can auto-create a real video meeting link. The
// recruiter connects once via "Sign in with Google/Microsoft/Zoom" — we store
// the refresh token and mint access tokens on demand. No manual token entry.
//
// Also adds meeting_provider + external meeting ids onto interviews so we can
// track/cancel the created meeting, and a notetaker-bot column for Phase 4.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("meeting_connections"))) {
    await knex.schema.createTable("meeting_connections", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      // Provider: 'google' (Meet) | 'microsoft' (Teams) | 'zoom'.
      t.string("provider", 20).notNullable();
      // The connecting recruiter (EmpCloud user id) + their provider account.
      t.bigInteger("connected_by").unsigned().nullable();
      t.string("account_email", 191).nullable();
      // OAuth material. access_token is short-lived; refresh_token is the durable
      // credential we use to mint new access tokens. Stored encrypted-at-rest is
      // recommended in prod (see MEETING_TOKEN_SECRET note in the oauth service).
      t.text("access_token").nullable();
      t.text("refresh_token").nullable();
      t.timestamp("expires_at").nullable();
      t.string("scope", 500).nullable();
      t.string("status", 20).notNullable().defaultTo("connected"); // connected | revoked | error
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.unique(["organization_id", "provider"]);
      t.index(["organization_id"]);
    });
  }

  // Short-lived OAuth `state` values (CSRF protection during the redirect dance).
  if (!(await knex.schema.hasTable("meeting_oauth_states"))) {
    await knex.schema.createTable("meeting_oauth_states", (t) => {
      t.uuid("id").primary();
      t.string("state", 128).notNullable().unique();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.bigInteger("user_id").unsigned().nullable();
      t.string("provider", 20).notNullable();
      t.string("redirect_after", 500).nullable();
      t.timestamp("expires_at").notNullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
  }

  // Track the created meeting on the interview so we can join a notetaker bot,
  // regenerate, or cancel it.
  await knex.schema.alterTable("interviews", (t) => {
    t.string("meeting_provider", 20).nullable(); // google | microsoft | zoom | manual
    t.string("meeting_external_id", 191).nullable(); // provider's meeting/event id
    t.text("meeting_metadata").nullable(); // JSON: passcode, dial-in, host url, etc.
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("interviews", (t) => {
    t.dropColumn("meeting_provider");
    t.dropColumn("meeting_external_id");
    t.dropColumn("meeting_metadata");
  });
  await knex.schema.dropTableIfExists("meeting_oauth_states");
  await knex.schema.dropTableIfExists("meeting_connections");
}
