import { pool } from "./db/index.js";
import { hashPassword } from "./utils/auth.js";

async function resetDatabase() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "❌ CRITICAL: Database reset is BLOCKED in production mode to prevent accidental data loss!",
    );
    process.exit(1);
  }

  console.log("🔄 Starting database cleanup and seeding Soft7 Admin...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // Drop foreign key constraint on assignee_id to support multiple assignees
    await client.query(
      "ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;",
    );

    // 1. Truncate all tables containing application mock/transactional data
    // CASCADE will clean up project_members, tasks, activity_items, sprints, leaves, meetings, meeting_attendees, user_invitations, refresh_tokens
    console.log("🧹 Truncating tables...");
    await client.query("TRUNCATE TABLE users CASCADE;");
    await client.query("TRUNCATE TABLE projects CASCADE;");
    await client.query("TRUNCATE TABLE sprints CASCADE;");
    await client.query("TRUNCATE TABLE meetings CASCADE;");
    await client.query("TRUNCATE TABLE leaves CASCADE;");
    await client.query("TRUNCATE TABLE organizations CASCADE;");

    // Double check truncate for other tables just in case CASCADE didn't cover some standalone tables
    await client.query("TRUNCATE TABLE user_invitations CASCADE;");
    await client.query("TRUNCATE TABLE refresh_tokens CASCADE;");

    // 2. Ensure system tables (roles, departments, permissions) have their default values
    console.log("📁 Ensuring system roles and departments exist...");
    await client.query(
      "ALTER TABLE roles ADD COLUMN IF NOT EXISTS rank INTEGER NOT NULL DEFAULT 4;",
    );
    await client.query("TRUNCATE TABLE roles CASCADE;");

    await client.query(`
      INSERT INTO roles (name, rank) VALUES
      ('Admin', 1),
      ('Manager', 2),
      ('Team leader', 3),
      ('Hr', 3),
      ('Teammates', 4);
    `);

    await client.query(`
      INSERT INTO role_permissions (role_id, permission_name) VALUES
      ((SELECT id FROM roles WHERE name = 'Admin'), '*'),
      ((SELECT id FROM roles WHERE name = 'Manager'), 'project:read'),
      ((SELECT id FROM roles WHERE name = 'Manager'), 'task:read'),
      ((SELECT id FROM roles WHERE name = 'Manager'), 'task:update'),
      ((SELECT id FROM roles WHERE name = 'Manager'), 'admin:manage'),
      ((SELECT id FROM roles WHERE name = 'Team leader'), 'project:read'),
      ((SELECT id FROM roles WHERE name = 'Team leader'), 'task:read'),
      ((SELECT id FROM roles WHERE name = 'Team leader'), 'task:update'),
      ((SELECT id FROM roles WHERE name = 'Hr'), 'project:read'),
      ((SELECT id FROM roles WHERE name = 'Hr'), 'task:read'),
      ((SELECT id FROM roles WHERE name = 'Hr'), 'task:update'),
      ((SELECT id FROM roles WHERE name = 'Teammates'), 'project:read'),
      ((SELECT id FROM roles WHERE name = 'Teammates'), 'task:read'),
      ((SELECT id FROM roles WHERE name = 'Teammates'), 'task:update')
      ON CONFLICT (role_id, permission_name) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO departments (name) VALUES
      ('Engineering'), ('Design'), ('Product'), ('Marketing'), ('Sales')
      ON CONFLICT (name) DO NOTHING;
    `);

    // Create default organization
    console.log("🏢 Seeding default organization (Delight Arts Studio)...");
    await client.query(`
      INSERT INTO organizations (id, name, phone, subscription_status, trial_ends_at, is_approved)
      VALUES ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'Delight Arts Studio', '1-800-555-0199', 'active', NOW() + INTERVAL '365 days', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Get role_id for Admin
    const roleRes = await client.query(
      "SELECT id FROM roles WHERE name = 'Admin';",
    );
    const adminRoleId = roleRes.rows[0]?.id;

    // Get department_id for Engineering
    const deptRes = await client.query(
      "SELECT id FROM departments WHERE name = 'Engineering';",
    );
    const engDeptId = deptRes.rows[0]?.id;

    if (!adminRoleId || !engDeptId) {
      throw new Error(
        "Failed to find Admin role or Engineering department in the database.",
      );
    }

    // 3. Create the Soft7 Admin user as SUPER ADMIN
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !password || password.length < 12) {
      throw new Error(
        "SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 12 characters are required in the environment.",
      );
    }

    const passwordHash = await hashPassword(password);
    console.log(`👤 Creating Soft7 Admin user (${email}) as Super Admin...`);
    await client.query(
      `INSERT INTO users (id, name, role, email, avatar_color, initials, password_hash, role_id, department_id, status, is_super_admin, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', TRUE, NULL);`,
      [
        "u-admin",
        "Soft7 Admin",
        "Admin",
        email,
        "var(--terracotta)",
        "SA",
        passwordHash,
        adminRoleId,
        engDeptId,
      ],
    );

    await client.query("COMMIT;");
    console.log("✨ Database successfully reset!");
    console.log(`👤 Admin email: ${email}`);
    console.log(
      `🔑 Admin password: ${password.substring(0, 3)}... (length: ${password.length})`,
    );
  } catch (error) {
    await client.query("ROLLBACK;");
    console.error("❌ Database reset failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();
