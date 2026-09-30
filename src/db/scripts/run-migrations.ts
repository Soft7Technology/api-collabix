import { runMigrations, pool } from "../index.js";

async function main() {
  try {
    await runMigrations();
    console.log("Migration runner completed.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
