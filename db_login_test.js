import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    const email = 'raghavchauhan179@gmail.com';
    console.log(`Running login SQL query for ${email}...`);
    const { rows } = await client.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role_id, u.status, u.is_super_admin, u.organization_id, u.department_id,
              r.name as role_name, r.rank as role_rank,
              d.name as department_name,
              o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = $1;`,
      [email]
    );
    console.log("Query completed successfully. Row count:", rows.length);
    if (rows.length > 0) {
      console.log("User Row:", rows[0]);
    } else {
      console.log("No rows returned. This means the JOIN on roles failed, or the user does not exist.");
    }
  } catch (err) {
    console.error("❌ SQL Query crashed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
