// ============================================================================
// MIGRATION 011 — Candidate Portal
//
// Adds the public-facing candidate portal:
//   - candidate_accounts : a candidate's own login (cross-org, OTP-verified).
//   - candidate_otps      : short-lived email OTP codes for signup/login.
//   - resume_files        : resumes stored AS A BLOB IN MYSQL (never on disk).
//   - links resumes + the owning candidate_account onto applications/candidates
//     and records the portal as an application source.
// ============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // --- candidate_accounts: the candidate's own login identity -----------------
  // Distinct from `candidates` (which are org-scoped ATS records). One account
  // can apply to jobs across many organizations; each application still spawns
  // an org-scoped `candidates` row, linked back here via account_id.
  if (!(await knex.schema.hasTable("candidate_accounts"))) {
    await knex.schema.createTable("candidate_accounts", (t) => {
      t.uuid("id").primary();
      t.string("email", 191).notNullable().unique();
      t.string("first_name", 64).nullable();
      t.string("last_name", 64).nullable();
      t.string("phone", 20).nullable();
      // Password is OPTIONAL — the portal is OTP-first. A candidate can log in
      // purely via email OTP; a password can be set later for convenience.
      t.string("password_hash", 255).nullable();
      t.boolean("email_verified").notNullable().defaultTo(false);
      t.string("headline", 200).nullable();
      t.string("location", 200).nullable();
      t.string("current_company", 200).nullable();
      t.string("current_title", 200).nullable();
      t.decimal("experience_years", 4, 1).nullable();
      t.string("linkedin_url", 500).nullable();
      t.string("portfolio_url", 500).nullable();
      t.json("skills").nullable();
      // A default resume the candidate can reuse across applications.
      t.uuid("default_resume_id").nullable();
      t.string("status", 20).notNullable().defaultTo("active"); // active | suspended
      t.timestamp("last_login_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["email"]);
    });
  }

  // --- candidate_otps: email OTP codes (signup + login) -----------------------
  if (!(await knex.schema.hasTable("candidate_otps"))) {
    await knex.schema.createTable("candidate_otps", (t) => {
      t.uuid("id").primary();
      t.string("email", 191).notNullable();
      t.string("code_hash", 255).notNullable(); // SHA-256 of the 6-digit code
      t.string("purpose", 20).notNullable().defaultTo("login"); // login | signup | verify
      t.integer("attempts").notNullable().defaultTo(0);
      t.timestamp("expires_at").notNullable();
      t.timestamp("consumed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["email", "purpose"]);
    });
  }

  // --- resume_files: the resume BLOB, stored IN MYSQL -------------------------
  // Per requirement: resumes are NOT written to local disk. The bytes live in a
  // LONGMEDIUM/LONGBLOB column here; everything references this row by id.
  if (!(await knex.schema.hasTable("resume_files"))) {
    await knex.schema.createTable("resume_files", (t) => {
      t.uuid("id").primary();
      t.uuid("account_id").nullable(); // owning candidate_account (portal uploads)
      t.bigInteger("organization_id").unsigned().nullable(); // when tied to an org application
      t.string("file_name", 255).notNullable();
      t.string("mime_type", 100).notNullable();
      t.integer("size_bytes").unsigned().notNullable();
      t.specificType("content", "LONGBLOB").notNullable(); // the actual bytes
      t.text("parsed_text").nullable(); // extracted plain text (for AI + search)
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["account_id"]);
      t.index(["organization_id"]);
    });
  }

  // --- link candidate_account + resume onto candidates ------------------------
  await knex.schema.alterTable("candidates", (t) => {
    t.uuid("account_id").nullable(); // set when the ATS candidate came from a portal login
    t.uuid("resume_file_id").nullable(); // resume stored in MySQL (replaces resume_path)
    t.index(["account_id"]);
  });

  // --- link resume + account + portal source onto applications ----------------
  await knex.schema.alterTable("applications", (t) => {
    t.uuid("account_id").nullable();
    t.uuid("resume_file_id").nullable();
    // Which external portal this application arrived from, when auto-fetched
    // (naukri | linkedin | indeed | apna | portal | direct). `source` already
    // exists as a coarse flag; this captures the specific portal + its ref id.
    t.string("source_portal", 30).nullable();
    t.string("source_ref", 191).nullable(); // portal's own application/candidate id
    t.index(["account_id"]);
    t.index(["source_portal"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("applications", (t) => {
    t.dropColumn("account_id");
    t.dropColumn("resume_file_id");
    t.dropColumn("source_portal");
    t.dropColumn("source_ref");
  });
  await knex.schema.alterTable("candidates", (t) => {
    t.dropColumn("account_id");
    t.dropColumn("resume_file_id");
  });
  await knex.schema.dropTableIfExists("resume_files");
  await knex.schema.dropTableIfExists("candidate_otps");
  await knex.schema.dropTableIfExists("candidate_accounts");
}
