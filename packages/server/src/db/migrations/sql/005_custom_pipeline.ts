import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("pipeline_stages", (t) => {
    t.uuid("id").primary();
    t.bigInteger("organization_id").unsigned().notNullable();
    t.string("name", 100).notNullable();
    t.string("slug", 100).notNullable();
    t.string("color", 20).defaultTo("#6B7280");
    t.integer("sort_order").defaultTo(0);
    t.boolean("is_default").defaultTo(false);
    t.boolean("is_active").defaultTo(true);
    t.timestamp("created_at").defaultTo(knex.fn.now());
    t.timestamp("updated_at").defaultTo(knex.fn.now());

    t.unique(["organization_id", "slug"]);
    t.index(["organization_id", "sort_order"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("pipeline_stages");
}
