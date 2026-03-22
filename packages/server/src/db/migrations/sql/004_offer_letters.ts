import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Offer Letter Templates
  await knex.schema.createTable("offer_letter_templates", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 200).notNullable();
    t.text("content_template").notNullable();
    t.boolean("is_default").defaultTo(false);
    t.boolean("is_active").defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
  });

  // Generated Offer Letters
  await knex.schema.createTable("generated_offer_letters", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.uuid("offer_id").notNullable().references("id").inTable("offers").onDelete("CASCADE");
    t.uuid("template_id").notNullable().references("id").inTable("offer_letter_templates").onDelete("CASCADE");
    t.text("content").notNullable();
    t.string("file_path", 512).nullable();
    t.bigInteger("generated_by").unsigned().notNullable();
    t.timestamp("sent_at").nullable();
    t.timestamp("created_at").defaultTo(knex.fn.now());

    t.index(["organization_id"]);
    t.index(["offer_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("generated_offer_letters");
  await knex.schema.dropTableIfExists("offer_letter_templates");
}
