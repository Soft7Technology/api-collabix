import { db } from "./db/index.js";

async function run() {
  const res = await db.query(
    `UPDATE organizations 
     SET trial_ends_at = NOW() + INTERVAL '5 days', 
         subscription_status = 'TRIALING', 
         is_approved = TRUE 
     WHERE trial_ends_at IS NULL OR trial_ends_at < NOW();`
  );
  console.log("Updated rows:", res.rowCount);
  process.exit(0);
}

run();
