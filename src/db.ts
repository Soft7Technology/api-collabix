import pg from "pg";
import { config } from "./config/index.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

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
