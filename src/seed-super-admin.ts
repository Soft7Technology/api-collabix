import { pool } from "./db/index.js";
import { hashPassword } from "./utils/auth.js";

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password || password.length < 8) {
    throw new Error(
      "SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 8 characters are required.",
    );
  }

  console.log(`👤 Checking for Super Admin (${email}) in the database...`);
  const client = await pool.connect();

  try {
    // 1. Check if the Super Admin already exists
    const checkRes = await client.query(
      "SELECT id FROM users WHERE email = $1;",
      [email],
    );
    if (checkRes.rows.length > 0) {
      console.log(
        `👤 Super Admin '${email}' already exists. Updating password...`,
      );
      const passwordHash = await hashPassword(password);
      await client.query(
        "UPDATE users SET password_hash = $1 WHERE email = $2;",
        [passwordHash, email]
      );
      console.log("✅ Super Admin password updated successfully!");
      return;
    }

    // 2. Fetch required Admin Role
    const roleRes = await client.query(
      "SELECT id FROM roles WHERE name = 'Admin';",
    );
    const adminRoleId = roleRes.rows[0]?.id;

    // 3. Fetch required Department
    const deptRes = await client.query(
      "SELECT id FROM departments WHERE name = 'Engineering';",
    );
    const engDeptId = deptRes.rows[0]?.id;

    if (!adminRoleId || !engDeptId) {
      console.error(
        "❌ Error: Admin role or Engineering department not found in database. Please run migrations first.",
      );
      process.exit(1);
    }

    // 4. Hash password and insert user
    const passwordHash = await hashPassword(password);

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

    console.log(`✨ Super Admin user '${email}' created successfully!`);
  } catch (error) {
    console.error("❌ Failed to seed Super Admin:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSuperAdmin();
