import crypto from "crypto";
import { pool, db } from "../db/index.js";
import { hashToken } from "./authService.js";
import { hashPassword } from "../utils/auth.js";

export class SuperService {
  /**
   * Creates a new organization and default workspace admin user.
   */
  static async createOrganization(data: {
    name: string;
    ownerEmail?: string;
    phone?: string;
    plan?: string;
  }) {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new Error("Organization name is required.");
    }

    // Check duplicate organization name
    const orgCheck = await db.query(
      "SELECT id FROM organizations WHERE LOWER(name) = LOWER($1);",
      [trimmedName],
    );
    if (orgCheck.rows[0]) {
      throw new Error(`An organization named "${trimmedName}" already exists.`);
    }

    const email = (data.ownerEmail || `admin@${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`).toLowerCase().trim();
    const phone = data.phone?.trim() || "";
    const plan = data.plan?.trim() || "Pro";

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Insert organization
      const orgResult = await client.query(
        `INSERT INTO organizations (name, phone, subscription_status, plan, trial_ends_at, is_approved, created_at, updated_at)
         VALUES ($1, $2, 'active', $3, NOW() + INTERVAL '30 days', TRUE, NOW(), NOW())
         RETURNING id, name, phone, subscription_status AS "subscriptionStatus", plan, trial_ends_at AS "trialEndsAt", is_approved AS "isApproved", created_at AS "createdAt";`,
        [trimmedName, phone, plan],
      );
      const newOrg = orgResult.rows[0];

      // 2. Fetch or create Admin role
      const roleRes = await client.query("SELECT id FROM roles WHERE name = 'Admin';");
      const adminRoleId = roleRes.rows[0]?.id;

      // 3. Create Admin user if email does not exist
      const existingUser = await client.query("SELECT id FROM users WHERE email = $1;", [email]);
      let ownerName = trimmedName + " Admin";

      if (!existingUser.rows[0] && adminRoleId) {
        const defaultPasswordHash = await hashPassword("Collabrix123!");
        const userId = `u${Date.now()}`;
        const initials = trimmedName.slice(0, 2).toUpperCase();

        await client.query(
          `INSERT INTO users (id, name, role, email, avatar_color, initials, password_hash, role_id, status, is_super_admin, organization_id, created_at, updated_at)
           VALUES ($1, $2, 'Admin', $3, 'var(--terracotta)', $4, $5, $6, 'ACTIVE', FALSE, $7, NOW(), NOW());`,
          [userId, ownerName, email, initials, defaultPasswordHash, adminRoleId, newOrg.id],
        );
      }

      await client.query("COMMIT;");

      return {
        ...newOrg,
        ownerName,
        ownerEmail: email,
        memberCount: 1,
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all organizations, joining with their admin owner profile details and member count.
   */
  static async getAllOrganizations() {
    const { rows } = await db.query(
      `SELECT o.id, o.name, o.phone, o.subscription_status AS "subscriptionStatus", 
              o.trial_ends_at AS "trialEndsAt", o.is_approved AS "isApproved", 
              COALESCE(o.plan, 'Pro') AS "plan",
              o.created_at AS "createdAt",
              u.name AS "ownerName", u.email AS "ownerEmail",
              (SELECT COUNT(*)::int FROM users mem WHERE mem.organization_id = o.id) AS "memberCount"
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id AND u.role = 'Admin'
       ORDER BY o.created_at DESC;`,
    );
    return rows;
  }

  /**
   * Updates organization details (name, phone, subscriptionStatus, trialEndsAt, plan, isApproved)
   */
  static async updateOrganization(
    id: string,
    data: {
      name?: string;
      phone?: string;
      subscriptionStatus?: string;
      trialEndsAt?: string;
      plan?: string;
      isApproved?: boolean;
    },
  ) {
    const { rows: existingRows } = await db.query(
      `SELECT id, name, phone, subscription_status, trial_ends_at, is_approved, plan FROM organizations WHERE id = $1;`,
      [id],
    );
    if (!existingRows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }
    const existing = existingRows[0];

    const newName = data.name !== undefined ? data.name.trim() : existing.name;
    const newPhone = data.phone !== undefined ? data.phone.trim() : existing.phone;
    const newStatus = data.subscriptionStatus !== undefined ? data.subscriptionStatus.trim().toLowerCase() : existing.subscription_status;
    const newTrialEndsAt = data.trialEndsAt !== undefined && data.trialEndsAt ? data.trialEndsAt : existing.trial_ends_at;
    const newPlan = data.plan !== undefined ? data.plan.trim() : (existing.plan || "Pro");
    const newIsApproved = data.isApproved !== undefined ? data.isApproved : (newStatus === "active" || existing.is_approved);

    const { rows: updatedRows } = await db.query(
      `UPDATE organizations
       SET name = $1, phone = $2, subscription_status = $3, trial_ends_at = $4, plan = $5, is_approved = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, phone, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt", is_approved AS "isApproved", plan;`,
      [newName, newPhone, newStatus, newTrialEndsAt, newPlan, newIsApproved, id],
    );

    return updatedRows[0];
  }

  /**
   * Approves an organization, updating its status to active and setting is_approved to true.
   */
  static async approveOrganization(id: string) {
    const { rows } = await db.query(
      `UPDATE organizations
       SET is_approved = TRUE, 
           subscription_status = 'active', 
           trial_ends_at = NOW() + INTERVAL '30 days',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, subscription_status, trial_ends_at, is_approved;`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    return rows[0];
  }

  /**
   * Revokes an organization, updating its status to expired and setting is_approved to false.
   */
  static async revokeOrganization(id: string) {
    const { rows } = await db.query(
      `UPDATE organizations
       SET is_approved = FALSE, 
           subscription_status = 'expired', 
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt", is_approved AS "isApproved";`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    return rows[0];
  }

  /**
   * Updates an organization's subscription plan (e.g. Starter, Basic, Pro, Enterprise).
   */
  static async updateOrganizationPlan(id: string, plan: string) {
    const validPlans = ["Starter", "Basic", "Pro", "Enterprise"];
    const normalizedPlan = validPlans.find((p) => p.toLowerCase() === plan.trim().toLowerCase()) || plan;
    const { rows } = await db.query(
      `UPDATE organizations
       SET plan = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, plan, subscription_status AS "subscriptionStatus", is_approved AS "isApproved";`,
      [normalizedPlan, id],
    );

    if (!rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    return rows[0];
  }

  /**
   * Deletes an organization and all associated user accounts entirely from the database.
   */
  static async deleteOrganization(id: string) {
    // 1. Delete all non-superadmin users belonging to this organization
    await db.query(
      `DELETE FROM users WHERE organization_id = $1 AND is_super_admin = FALSE;`,
      [id],
    );

    // 2. Delete any orphan non-superadmin users without an organization
    await db.query(
      `DELETE FROM users WHERE organization_id IS NULL AND is_super_admin = FALSE;`,
    );

    // 3. Delete the organization itself
    const { rowCount } = await db.query(
      `DELETE FROM organizations WHERE id = $1;`,
      [id],
    );

    if (rowCount === 0) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    return true;
  }

  /**
   * Finds an active user in the organization to impersonate (prioritizing lowest role rank).
   */
  static async impersonateOrganization(id: string) {
    const orgRes = await db.query(
      `SELECT id, name, subscription_status AS "subscriptionStatus", is_approved AS "isApproved"
       FROM organizations WHERE id = $1;`,
      [id],
    );
    if (!orgRes.rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, r.name AS role_name, r.rank AS role_rank
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.organization_id = $1
       ORDER BY r.rank ASC, u.created_at ASC
       LIMIT 1;`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`No active user found in organization '${orgRes.rows[0].name}' to impersonate.`);
    }

    const targetUser = rows[0];

    // Generate Refresh Token
    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const rfHash = hashToken(rawRefreshToken);
    const rfExpires = new Date();
    rfExpires.setDate(rfExpires.getDate() + 30);

    await db.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3);",
      [targetUser.id, rfHash, rfExpires],
    );

    return {
      user: targetUser,
      organization: orgRes.rows[0],
      rawRefreshToken,
    };
  }

  /**
   * Retrieves all users across all organizations with their role, organization, and department details.
   */
  static async getAllUsers() {
    const { rows } = await db.query(
      `SELECT 
         u.id, 
         u.name, 
         u.email, 
         u.status, 
         u.avatar_color AS "avatarColor",
         u.initials,
         u.is_super_admin AS "isSuperAdmin",
         u.created_at AS "createdAt",
         r.id AS "roleId",
         COALESCE(r.name, 'Teammates') AS "roleName",
         o.id AS "organizationId",
         COALESCE(o.name, 'Platform') AS "organizationName",
         COALESCE(o.plan, 'Pro') AS "organizationPlan",
         d.name AS "departmentName"
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.created_at DESC;`,
    );
    return rows;
  }

  /**
   * Updates user details (name, email, role, status) from the superadmin console.
   */
  static async updateUser(
    userId: string,
    data: {
      name?: string;
      email?: string;
      roleName?: string;
      status?: string;
    },
  ) {
    const { rows: existingUserRows } = await db.query(
      `SELECT id, name, email, status, role_id, is_super_admin FROM users WHERE id = $1;`,
      [userId],
    );
    if (!existingUserRows[0]) {
      throw new Error(`User with ID '${userId}' not found.`);
    }
    const existing = existingUserRows[0];

    let roleId = existing.role_id;
    if (data.roleName) {
      const roleRes = await db.query(`SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1);`, [data.roleName.trim()]);
      if (!roleRes.rows[0]) {
        throw new Error(`Role '${data.roleName}' does not exist.`);
      }
      roleId = roleRes.rows[0].id;
    }

    const newName = data.name !== undefined ? data.name.trim() : existing.name;
    const newEmail = data.email !== undefined ? data.email.trim().toLowerCase() : existing.email;
    const newStatus = data.status !== undefined ? data.status.trim().toUpperCase() : existing.status;

    // Recalculate initials if name is updated
    const initials = newName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n: string) => n[0].toUpperCase())
      .join("") || "U";

    await db.query(
      `UPDATE users
       SET name = $1, email = $2, role_id = $3, status = $4, initials = $5, updated_at = NOW()
       WHERE id = $6;`,
      [newName, newEmail, roleId, newStatus, initials, userId],
    );

    const { rows: enriched } = await db.query(
      `SELECT 
         u.id, 
         u.name, 
         u.email, 
         u.status, 
         u.avatar_color AS "avatarColor",
         u.initials,
         u.is_super_admin AS "isSuperAdmin",
         u.created_at AS "createdAt",
         r.id AS "roleId",
         COALESCE(r.name, 'Teammates') AS "roleName",
         o.id AS "organizationId",
         COALESCE(o.name, 'Platform') AS "organizationName",
         COALESCE(o.plan, 'Pro') AS "organizationPlan",
         d.name AS "departmentName"
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1;`,
      [userId],
    );

    return enriched[0];
  }

  /**
   * Updates a user's role from the superadmin console.
   */
  static async updateUserRole(userId: string, roleName: string) {
    const roleRes = await db.query(`SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1);`, [roleName.trim()]);
    if (!roleRes.rows[0]) {
      throw new Error(`Role '${roleName}' does not exist.`);
    }
    const roleId = roleRes.rows[0].id;
    const { rows } = await db.query(
      `UPDATE users
       SET role_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, status, role_id;`,
      [roleId, userId],
    );
    if (!rows[0]) {
      throw new Error(`User with ID '${userId}' not found.`);
    }
    return { ...rows[0], roleName: roleRes.rows[0].name };
  }

  /**
   * Updates a user's status (e.g. ACTIVE or SUSPENDED).
   */
  static async updateUserStatus(userId: string, status: string) {
    const validStatus = status.toUpperCase();
    const { rows } = await db.query(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, status;`,
      [validStatus, userId],
    );
    if (!rows[0]) {
      throw new Error(`User with ID '${userId}' not found.`);
    }
    return rows[0];
  }

  /**
   * Deletes a user by ID.
   */
  static async deleteUser(userId: string) {
    const { rows } = await db.query(`SELECT is_super_admin FROM users WHERE id = $1;`, [userId]);
    if (rows[0]?.is_super_admin) {
      throw new Error("Super admin users cannot be deleted.");
    }
    const { rowCount } = await db.query(`DELETE FROM users WHERE id = $1;`, [userId]);
    if (rowCount === 0) {
      throw new Error(`User with ID '${userId}' not found.`);
    }
    return true;
  }

  /**
   * Retrieves unified system and audit logs across all organizations.
   */
  static async getSystemLogs() {
    const { rows } = await db.query(
      `SELECT * FROM (
         -- 1. Activity items
         SELECT 
           a.id, 
           'sys' AS category, 
           CONCAT(COALESCE(u.name, 'User'), ' ', a.action, ' on ', a.target, CASE WHEN o.name IS NOT NULL THEN CONCAT(' (', o.name, ')') ELSE '' END) AS message,
           a.timestamp AS timestamp
         FROM activity_items a
         LEFT JOIN users u ON a.actor_id = u.id
         LEFT JOIN organizations o ON u.organization_id = o.id

         UNION ALL

         -- 2. Organizations created
         SELECT 
           CONCAT('org-', o.id) AS id,
           'info' AS category,
           CONCAT('Workspace "', o.name, '" registered with status ', o.subscription_status) AS message,
           TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp
         FROM organizations o

         UNION ALL

         -- 3. Users registered
         SELECT 
           CONCAT('usr-', u.id) AS id,
           'sec' AS category,
           CONCAT('User account "', u.name, '" (', u.email, ') was provisioned') AS message,
           TO_CHAR(u.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp
         FROM users u
       ) unified_logs
       ORDER BY timestamp DESC
       LIMIT 100;`,
    );
    return rows;
  }
}
