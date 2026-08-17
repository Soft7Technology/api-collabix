import pg from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/index.js";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../migrations");

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

export async function runMigrations() {
  console.log("🔄 Checking database migrations...");
  const client = await pool.connect();
  try {
    // 1. Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already executed migrations
    const { rows } = await client.query("SELECT name FROM migrations;");
    const executedMigrations = new Set(rows.map((r) => r.name));

    // 3. Verify migrations directory exists
    await fs.access(migrationsDir);

    // 4. Read migration files
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    // 5. Run pending migrations
    for (const file of sqlFiles) {
      if (!executedMigrations.has(file)) {
        console.log(`🚀 Executing migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, "utf-8");

        await client.query("BEGIN;");
        try {
          await client.query(sql);
          await client.query("INSERT INTO migrations (name) VALUES ($1);", [
            file,
          ]);
          await client.query("COMMIT;");
          console.log(`✅ Migration ${file} successfully executed.`);
        } catch (err) {
          await client.query("ROLLBACK;");
          console.error(`❌ Error executing migration ${file}:`, err);
          throw err;
        }
      }
    }

    // 6. Run post-migration alters once all tables are guaranteed to exist
    await client.query(`
      ALTER TABLE screen_logs ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
    `);

    console.log("✨ All migrations are up to date.");
  } catch (error) {
    console.error("❌ Migration runner failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executes a query and returns all matching rows.
 */
export async function query<T = any>(
  text: string,
  params?: any[],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

/**
 * Executes a query and returns the first row, or null if no rows matched.
 */
export async function queryOne<T = any>(
  text: string,
  params?: any[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Tests the database connection. Returns true if healthy, false otherwise.
 */
export async function health(): Promise<boolean> {
  try {
    await pool.query("SELECT 1;");
    return true;
  } catch (error) {
    console.error("❌ Database health check failed:", error);
    return false;
  }
}
