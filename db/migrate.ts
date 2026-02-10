import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./pool.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await client.query(
      "SELECT filename FROM schema_migrations ORDER BY filename",
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        console.log(`Applied ${file}`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`Failed to apply ${file}:`, e);
        throw e;
      }
    }

    console.log("All migrations applied");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
