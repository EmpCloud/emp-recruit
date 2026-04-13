import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Background Check Packages
  await knex.schema.createTable("background_check_packages", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.json("checks_included").notNullable(); // array of check_types
    t.string("provider", 20).notNullable(); // checkr, sterling, hireright, manual
    t.integer("estimated_days").nullable();
    t.bigInteger("cost").nullable(); // smallest currency unit
    t.boolean("is_default").defaultTo(false);
    t.boolean("is_active").defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "is_active"]);
  });

  // Background Checks
  await knex.schema.createTable("background_checks", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("candidate_id").notNullable().references("id").inTable("candidates").onDelete("CASCADE");
    t.string("provider", 20).notNullable(); // checkr, sterling, hireright, manual
    t.string("check_type", 20).notNullable(); // criminal, employment, education, credit, reference, identity
    t.string("status", 20).notNullable().defaultTo("pending"); // pending, in_progress, completed, failed, cancelled
    t.string("request_id", 200).nullable(); // provider's external ID
    t.string("result", 20).nullable(); // clear, consider, adverse, pending
    t.json("result_details").nullable();
    t.bigInteger("initiated_by").unsigned().notNullable();
    t.timestamp("requested_at").defaultTo(knex.fn.now());
    t.timestamp("completed_at").nullable();
    t.string("report_url", 512).nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["organization_id", "candidate_id"]);
    t.index(["organization_id", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("background_checks");
  await knex.schema.dropTableIfExists("background_check_packages");
}
