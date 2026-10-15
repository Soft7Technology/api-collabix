import crypto from "crypto";
import { db } from "../db/index.js";
import { hashToken } from "./authService.js";
import { hashPassword } from "../utils/auth.js";

let maintenanceModeCache: { active: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 5000; // 5 seconds cache to eliminate DB contention

export class SuperService {
  /**
   * Checks whether global system maintenance mode is currently active.
   */
  static async isMaintenanceModeActive(): Promise<boolean> {
    const now = Date.now();
    if (maintenanceModeCache && now - maintenanceModeCache.timestamp < CACHE_TTL_MS) {
      return maintenanceModeCache.active;
    }

    try {
      const { rows } = await db.query(
        `SELECT key, value FROM system_platform_settings WHERE key = 'maintenance_mode'
         UNION ALL
         SELECT id AS key, CASE WHEN enabled THEN 'true' ELSE 'false' END AS value 
         FROM system_security_settings WHERE id IN ('maint', 'maintenance');`,
      );

      let isActive = false;
      for (const r of rows) {
        if (r.value === "true" || r.value === "1") {
          isActive = true;
          break;
        }
      }

      maintenanceModeCache = { active: isActive, timestamp: now };
      return isActive;
    } catch {
      return false;
    }
  }

  /**
   * Helper to write an entry to system_audit_logs.
   */
  static async logAudit(
    category: "sec" | "info" | "sys",
    message: string,
    organizationId?: string | null,
    userId?: string | null,
  ) {
    try {
      await db.query(
        `INSERT INTO system_audit_logs (category, message, organization_id, user_id)
         VALUES ($1, $2, $3, $4);`,
        [category, message, organizationId || null, userId || null],
      );
    } catch (err) {
      console.error("Failed to write system audit log:", err);
    }
  }

  // ==========================================
  // Organizations Management
  // ==========================================

  /**
   * Retrieves all organizations, joining with their admin owner profile details and member counts.
   */
  static async getAllOrganizations() {
    const { rows } = await db.query(
      `SELECT o.id, o.name, o.phone, 
              CASE 
                WHEN o.subscription_status = 'revoked' OR o.is_approved = FALSE THEN 'revoked'
                WHEN o.trial_ends_at IS NOT NULL AND o.trial_ends_at < NOW() THEN 'expired'
                WHEN LOWER(o.subscription_status) = 'trial' THEN 'trial'
                ELSE LOWER(COALESCE(o.subscription_status, 'active'))
              END AS "subscriptionStatus", 
              o.trial_ends_at AS "trialEndsAt", o.is_approved AS "isApproved", 
              COALESCE(o.plan, 'Pro') AS "plan",
              o.created_at AS "createdAt",
              u.name AS "ownerName", u.email AS "ownerEmail",
              (SELECT COUNT(*)::int FROM users usr WHERE usr.organization_id = o.id) AS "memberCount"
       FROM organizations o
       LEFT JOIN LATERAL (
         SELECT name, email FROM users usr
         WHERE usr.organization_id = o.id
         ORDER BY (usr.role = 'Admin') DESC, usr.created_at ASC
         LIMIT 1
       ) u ON true
       ORDER BY o.created_at DESC;`,
    );
    return rows;
  }

  /**
   * Creates a new organization workspace on behalf of a client.
   */
  static async createOrganization(payload: {
    name: string;
    ownerEmail?: string;
    phone?: string;
    plan?: string;
  }) {
    const planTier = payload.plan || "Pro";
    const orgName = payload.name.trim();
    const phone = payload.phone?.trim() || null;
    const ownerEmail = payload.ownerEmail?.trim().toLowerCase() || null;

    const { rows: orgRows } = await db.query(
      `INSERT INTO organizations (name, phone, plan, subscription_status, trial_ends_at, is_approved)
       VALUES ($1, $2, $3, 'active', NOW() + INTERVAL '30 days', TRUE)
       RETURNING id, name, phone, plan, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt", is_approved AS "isApproved", created_at AS "createdAt";`,
      [orgName, phone, planTier],
    );

    const org = orgRows[0];

    let ownerName = null;
    if (ownerEmail) {
      const existingUser = await db.query(
        `SELECT id, name, email FROM users WHERE LOWER(email) = $1;`,
        [ownerEmail],
      );

      if (existingUser.rows.length > 0) {
        await db.query(
          `UPDATE users SET organization_id = $1 WHERE id = $2 AND is_super_admin = FALSE;`,
          [org.id, existingUser.rows[0].id],
        );
        ownerName = existingUser.rows[0].name;
      } else {
        const adminRole = await db.query(`SELECT id FROM roles WHERE name = 'Admin';`);
        const engDept = await db.query(`SELECT id FROM departments WHERE name = 'Engineering';`);
        const userId = "u-" + crypto.randomBytes(4).toString("hex");
        const name = ownerEmail
          .split("@")[0]
          .replace(/[._]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        const initials =
          name
            .split(" ")
            .slice(0, 2)
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "AD";
        const tempPass = await hashPassword(crypto.randomBytes(8).toString("hex"));

        await db.query(
          `INSERT INTO users (id, name, role, email, avatar_color, initials, password_hash, role_id, department_id, status, is_super_admin, organization_id)
           VALUES ($1, $2, 'Admin', $3, 'var(--terracotta)', $4, $5, $6, $7, 'ACTIVE', FALSE, $8);`,
          [
            userId,
            name,
            ownerEmail,
            initials,
            tempPass,
            adminRole.rows[0]?.id,
            engDept.rows[0]?.id,
            org.id,
          ],
        );
        ownerName = name;
      }
    }

    await SuperService.logAudit(
      "info",
      `Organization "${org.name}" was created by Super Admin (Plan: ${planTier}).`,
      org.id,
    );

    // Auto-generate initial subscription invoice for the new organization
    const invoiceAmount = planTier === "Enterprise" ? "₹999 /mo" : planTier === "Basic" ? "₹200 /mo" : "₹450 /mo";
    try {
      await SuperService.createInvoice({
        organizationId: org.id,
        plan: planTier,
        amount: invoiceAmount,
        status: "paid",
      });
    } catch (invErr) {
      console.error("Failed to auto-create initial invoice:", invErr);
    }

    return {
      ...org,
      ownerName,
      ownerEmail,
      memberCount: ownerEmail ? 1 : 0,
    };
  }

  /**
   * Updates organization details.
   */
  static async updateOrganization(
    id: string,
    payload: {
      name?: string;
      phone?: string;
      subscriptionStatus?: string;
      trialEndsAt?: string;
      plan?: string;
      isApproved?: boolean;
    },
  ) {
    const existing = await db.query(`SELECT * FROM organizations WHERE id = $1;`, [id]);
    if (!existing.rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    const updates: string[] = ["updated_at = NOW()"];
    const values: any[] = [id];

    if (payload.name !== undefined) {
      values.push(payload.name.trim());
      updates.push(`name = $${values.length}`);
    }
    if (payload.phone !== undefined) {
      values.push(payload.phone.trim() || null);
      updates.push(`phone = $${values.length}`);
    }
    if (payload.subscriptionStatus !== undefined) {
      values.push(payload.subscriptionStatus);
      updates.push(`subscription_status = $${values.length}`);
    }
    if (payload.trialEndsAt !== undefined) {
      values.push(payload.trialEndsAt ? new Date(payload.trialEndsAt) : null);
      updates.push(`trial_ends_at = $${values.length}`);
    }
    if (payload.plan !== undefined) {
      values.push(payload.plan);
      updates.push(`plan = $${values.length}`);
    }
    if (payload.isApproved !== undefined) {
      values.push(payload.isApproved);
      updates.push(`is_approved = $${values.length}`);
    }

    const { rows } = await db.query(
      `UPDATE organizations
       SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING id, name, phone, COALESCE(plan, 'Pro') AS plan, 
         CASE 
           WHEN subscription_status = 'revoked' OR is_approved = FALSE THEN 'revoked'
           WHEN trial_ends_at IS NOT NULL AND trial_ends_at < NOW() THEN 'expired'
           WHEN LOWER(subscription_status) = 'trial' THEN 'trial'
           ELSE LOWER(COALESCE(subscription_status, 'active'))
         END AS "subscriptionStatus", 
         trial_ends_at AS "trialEndsAt", is_approved AS "isApproved", created_at AS "createdAt";`,
      values,
    );

    await SuperService.logAudit(
      "info",
      `Organization "${rows[0].name}" details were updated by Super Admin.`,
      id,
    );

    return rows[0];
  }

  /**
   * Updates organization plan tier.
   */
  static async updateOrganizationPlan(id: string, plan: string) {
    const { rows } = await db.query(
      `UPDATE organizations
       SET plan = $2, 
           subscription_status = 'active', 
           is_approved = TRUE, 
           trial_ends_at = NOW() + INTERVAL '30 days',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, phone, COALESCE(plan, 'Pro') AS plan, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt", is_approved AS "isApproved";`,
      [id, plan],
    );

    if (!rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    await SuperService.logAudit(
      "info",
      `Organization plan for "${rows[0].name}" was updated to '${plan}'.`,
      id,
    );

    // Auto-record upgraded billing invoice
    const newAmount = plan === "Enterprise" ? "₹999 /mo" : plan === "Basic" ? "₹200 /mo" : "₹450 /mo";
    try {
      await SuperService.createInvoice({
        organizationId: id,
        plan: plan,
        amount: newAmount,
        status: "paid",
      });
    } catch (invErr) {
      console.error("Failed to auto-record plan upgrade invoice:", invErr);
    }

    return rows[0];
  }

  /**
   * Approves an organization.
   */
  static async approveOrganization(id: string) {
    const { rows } = await db.query(
      `UPDATE organizations
       SET is_approved = TRUE, 
           subscription_status = 'active', 
           trial_ends_at = NOW() + INTERVAL '30 days',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, COALESCE(plan, 'Pro') AS plan, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt", is_approved AS "isApproved";`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    await SuperService.logAudit(
      "info",
      `Organization "${rows[0].name}" was approved by Super Admin.`,
      id,
    );

    return rows[0];
  }

  /**
   * Revokes an organization.
   */
  static async revokeOrganization(id: string) {
    const { rows } = await db.query(
      `UPDATE organizations
       SET is_approved = FALSE, 
           subscription_status = 'revoked', 
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, COALESCE(plan, 'Pro') AS plan, subscription_status AS "subscriptionStatus", trial_ends_at AS "trialEndsAt", is_approved AS "isApproved";`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    await SuperService.logAudit(
      "sec",
      `Organization "${rows[0].name}" was suspended / revoked by Super Admin.`,
      id,
    );

    return rows[0];
  }

  /**
   * Deletes an organization safely inside a transaction, cleaning up dependencies.
   */
  static async deleteOrganization(id: string) {
    const orgRes = await db.query(`SELECT name FROM organizations WHERE id = $1;`, [id]);
    const orgName = orgRes.rows[0]?.name || id;

    // Transactional multi-table dependency cleanup
    await db.query("BEGIN;");
    try {
      // 1. Unlink system audit logs
      await db.query(`UPDATE system_audit_logs SET organization_id = NULL WHERE organization_id = $1;`, [id]);

      // 2. Remove support ticket replies and tickets
      await db.query(`DELETE FROM support_tickets WHERE organization_id = $1;`, [id]);

      // 3. Remove billing invoices
      await db.query(`DELETE FROM invoices WHERE organization_id = $1;`, [id]);

      // 4. Delete regular tenant users (preserving any platform superadmins)
      await db.query(`DELETE FROM users WHERE organization_id = $1 AND is_super_admin = FALSE;`, [id]);

      // 5. Delete organization
      const { rowCount } = await db.query(`DELETE FROM organizations WHERE id = $1;`, [id]);

      await db.query("COMMIT;");

      if (rowCount === 0) {
        throw new Error(`Organization with ID '${id}' not found.`);
      }

      await SuperService.logAudit(
        "sec",
        `Organization "${orgName}" was permanently deleted by Super Admin.`,
        null,
      );

      return true;
    } catch (err) {
      await db.query("ROLLBACK;");
      throw err;
    }
  }

  /**
   * Impersonates an active user in an organization.
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
    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const rfHash = hashToken(rawRefreshToken);
    const rfExpires = new Date();
    rfExpires.setDate(rfExpires.getDate() + 30);

    await db.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3);",
      [targetUser.id, rfHash, rfExpires],
    );

    await SuperService.logAudit(
      "sec",
      `Super Admin impersonated workspace "${orgRes.rows[0].name}".`,
      id,
      targetUser.id,
    );

    return {
      user: targetUser,
      organization: orgRes.rows[0],
      rawRefreshToken,
    };
  }

  // ==========================================
  // Platform Users Management
  // ==========================================

  /**
   * Retrieves all platform users across every organization.
   */
  static async getAllUsers() {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.status, u.avatar_color AS "avatarColor", 
              u.initials, u.is_super_admin AS "isSuperAdmin", u.created_at AS "createdAt",
              u.role_id AS "roleId", COALESCE(r.name, u.role, 'Teammates') AS "roleName",
              u.organization_id AS "organizationId", 
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
   * Updates platform user details.
   */
  static async updateUser(
    id: string,
    payload: { name?: string; email?: string; roleName?: string; status?: string },
  ) {
    const existing = await db.query(`SELECT * FROM users WHERE id = $1;`, [id]);
    if (!existing.rows[0]) {
      throw new Error(`User with ID '${id}' not found.`);
    }

    const updates: string[] = ["updated_at = NOW()"];
    const values: any[] = [id];

    if (payload.name !== undefined) {
      values.push(payload.name.trim());
      updates.push(`name = $${values.length}`);
    }
    if (payload.email !== undefined) {
      values.push(payload.email.trim().toLowerCase());
      updates.push(`email = $${values.length}`);
    }
    if (payload.status !== undefined) {
      const normStatus = payload.status.toUpperCase();
      values.push(normStatus);
      updates.push(`status = $${values.length}`);
      if (normStatus === "SUSPENDED" || normStatus === "INACTIVE") {
        await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1;`, [id]);
      }
    }
    if (payload.roleName !== undefined) {
      const roleRes = await db.query(
        `SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1);`,
        [payload.roleName.trim()],
      );
      if (roleRes.rows[0]) {
        values.push(roleRes.rows[0].id);
        updates.push(`role_id = $${values.length}`);
        values.push(roleRes.rows[0].name);
        updates.push(`role = $${values.length}`);
      }
    }

    await db.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = $1;`,
      values,
    );

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.status, u.avatar_color AS "avatarColor", 
              u.initials, u.is_super_admin AS "isSuperAdmin", u.created_at AS "createdAt",
              u.role_id AS "roleId", COALESCE(r.name, u.role, 'Teammates') AS "roleName",
              u.organization_id AS "organizationId", 
              COALESCE(o.name, 'Platform') AS "organizationName", 
              COALESCE(o.plan, 'Pro') AS "organizationPlan",
              d.name AS "departmentName"
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1;`,
      [id],
    );

    await SuperService.logAudit(
      "sec",
      `User details for "${rows[0].name}" (${rows[0].email}) were updated by Super Admin.`,
      rows[0].organizationId,
      id,
    );

    return rows[0];
  }

  /**
   * Updates only the role for a user.
   */
  static async updateUserRole(id: string, roleName: string) {
    const roleRes = await db.query(
      `SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1);`,
      [roleName.trim()],
    );
    if (!roleRes.rows[0]) {
      throw new Error(`Role '${roleName}' not found.`);
    }

    await db.query(
      `UPDATE users
       SET role_id = $1, role = $2, updated_at = NOW()
       WHERE id = $3;`,
      [roleRes.rows[0].id, roleRes.rows[0].name, id],
    );

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.status, u.avatar_color AS "avatarColor", 
              u.initials, u.is_super_admin AS "isSuperAdmin", u.created_at AS "createdAt",
              u.role_id AS "roleId", COALESCE(r.name, u.role, 'Teammates') AS "roleName",
              u.organization_id AS "organizationId", 
              COALESCE(o.name, 'Platform') AS "organizationName", 
              COALESCE(o.plan, 'Pro') AS "organizationPlan",
              d.name AS "departmentName"
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1;`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`User with ID '${id}' not found.`);
    }

    await SuperService.logAudit(
      "sec",
      `Role for user "${rows[0].name}" changed to '${roleRes.rows[0].name}'.`,
      rows[0].organizationId,
      id,
    );

    return rows[0];
  }

  /**
   * Updates only the status for a user.
   */
  static async updateUserStatus(id: string, status: string) {
    const normStatus = status.toUpperCase();
    if (!["ACTIVE", "SUSPENDED", "INACTIVE"].includes(normStatus)) {
      throw new Error(`Invalid user status '${status}'. Must be ACTIVE, SUSPENDED, or INACTIVE.`);
    }

    await db.query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2;`,
      [normStatus, id],
    );

    if (normStatus === "SUSPENDED" || normStatus === "INACTIVE") {
      await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1;`, [id]);
    }

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.status, u.avatar_color AS "avatarColor", 
              u.initials, u.is_super_admin AS "isSuperAdmin", u.created_at AS "createdAt",
              u.role_id AS "roleId", COALESCE(r.name, u.role, 'Teammates') AS "roleName",
              u.organization_id AS "organizationId", 
              COALESCE(o.name, 'Platform') AS "organizationName", 
              COALESCE(o.plan, 'Pro') AS "organizationPlan",
              d.name AS "departmentName"
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1;`,
      [id],
    );

    if (!rows[0]) {
      throw new Error(`User with ID '${id}' not found.`);
    }

    await SuperService.logAudit(
      "sec",
      `Status for user "${rows[0].name}" changed to '${normStatus}'.`,
      rows[0].organizationId,
      id,
    );

    return rows[0];
  }

  /**
   * Deletes a user account.
   */
  static async deleteUser(id: string) {
    const userRes = await db.query(
      `SELECT id, name, email, is_super_admin, organization_id FROM users WHERE id = $1;`,
      [id],
    );
    if (!userRes.rows[0]) {
      throw new Error(`User with ID '${id}' not found.`);
    }

    if (userRes.rows[0].is_super_admin) {
      throw new Error(`Cannot delete Super Admin account.`);
    }

    await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1;`, [id]);
    await db.query(`DELETE FROM user_invitations WHERE user_id = $1;`, [id]);
    await db.query(`DELETE FROM users WHERE id = $1;`, [id]);

    await SuperService.logAudit(
      "sec",
      `User account "${userRes.rows[0].name}" (${userRes.rows[0].email}) was deleted by Super Admin.`,
      userRes.rows[0].organization_id,
      null,
    );

    return { id };
  }

  // ==========================================
  // System Audit Logs
  // ==========================================

  /**
   * Retrieves audit logs with optional category filter.
   */
  static async getAuditLogs(category?: string) {
    let queryText = `
      SELECT id, category, message, created_at AS "timestamp"
      FROM system_audit_logs
    `;
    const params: any[] = [];
    if (category && category !== "all") {
      params.push(category);
      queryText += ` WHERE category = $1`;
    }
    queryText += ` ORDER BY created_at DESC LIMIT 200;`;

    const { rows } = await db.query(queryText, params);
    return rows;
  }

  // ==========================================
  // Feature Flags Management (Phase 2)
  // ==========================================

  /**
   * Retrieves all feature flags.
   */
  static async getFeatureFlags() {
    const { rows } = await db.query(
      `SELECT id, label, sub, enabled FROM system_feature_flags ORDER BY id ASC;`,
    );
    return rows;
  }

  /**
   * Toggles or updates a feature flag.
   */
  static async toggleFeatureFlag(id: string, enabled: boolean) {
    const { rows } = await db.query(
      `UPDATE system_feature_flags
       SET enabled = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, label, sub, enabled;`,
      [id, enabled],
    );
    if (!rows[0]) {
      throw new Error(`Feature flag '${id}' not found.`);
    }

    await SuperService.logAudit(
      "sys",
      `Feature flag "${rows[0].label}" was ${enabled ? "enabled" : "disabled"} by Super Admin.`,
    );

    return rows[0];
  }

  // ==========================================
  // Security Policies Management (Phase 2)
  // ==========================================

  /**
   * Retrieves all security settings / policies.
   */
  static async getSecurityPolicies() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_security_settings (
        id VARCHAR(50) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        sub VARCHAR(255) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO system_security_settings (id, label, sub, enabled)
      VALUES 
        ('2fa', 'Enforce 2FA for all org admins', 'Applies across every organization', TRUE),
        ('sso', 'Require SSO for Enterprise plan', 'Google Workspace / Okta / Azure AD', FALSE),
        ('ip', 'IP allow-listing', 'Restrict platform admin console by IP', FALSE),
        ('auto', 'Auto-suspend on repeated breach attempts', 'Lock org after 5 failed admin logins', TRUE),
        ('maint', 'System Maintenance Mode', 'Block all non-superadmin traffic and customer logins', FALSE)
      ON CONFLICT (id) DO NOTHING;
    `);

    const { rows } = await db.query(
      `SELECT id, label, sub, enabled FROM system_security_settings ORDER BY id ASC;`,
    );
    return rows;
  }

  /**
   * Toggles or updates a security policy.
   */
  static async toggleSecurityPolicy(id: string, enabled: boolean) {
    const { rows } = await db.query(
      `UPDATE system_security_settings
       SET enabled = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, label, sub, enabled;`,
      [id, enabled],
    );
    if (!rows[0]) {
      throw new Error(`Security policy '${id}' not found.`);
    }

    if (id === "maint" || id === "maintenance") {
      maintenanceModeCache = { active: enabled, timestamp: Date.now() };
    } else {
      maintenanceModeCache = null;
    }

    await SuperService.logAudit(
      "sec",
      `Security policy "${rows[0].label}" was ${enabled ? "activated" : "deactivated"} by Super Admin.`,
    );

    return rows[0];
  }

  // ==========================================
  // Platform Settings & API Keys (Phase 2)
  // ==========================================

  /**
   * Retrieves general platform settings and API keys.
   */
  static async getPlatformSettings() {
    const { rows } = await db.query(`SELECT key, value FROM system_platform_settings;`);
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    return {
      platformName: settings["platform_name"] || "SOFT7",
      supportEmail: settings["support_email"] || "support@soft7.in",
      defaultTimezone: settings["default_timezone"] || "IST — Asia/Kolkata",
      accentColor: settings["accent_color"] || "#3cdb73",
      apiKey: settings["public_api_key"] || "pk_live_default",
      webhookSecret: settings["webhook_secret"] || "whsec_default",
    };
  }

  /**
   * Updates general and branding platform settings.
   */
  static async updatePlatformSettings(payload: {
    platformName?: string;
    supportEmail?: string;
    defaultTimezone?: string;
    accentColor?: string;
  }) {
    if (payload.platformName !== undefined) {
      await db.query(
        `INSERT INTO system_platform_settings (key, value, updated_at)
         VALUES ('platform_name', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [payload.platformName.trim()],
      );
    }
    if (payload.supportEmail !== undefined) {
      await db.query(
        `INSERT INTO system_platform_settings (key, value, updated_at)
         VALUES ('support_email', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [payload.supportEmail.trim()],
      );
    }
    if (payload.defaultTimezone !== undefined) {
      await db.query(
        `INSERT INTO system_platform_settings (key, value, updated_at)
         VALUES ('default_timezone', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [payload.defaultTimezone.trim()],
      );
    }
    if (payload.accentColor !== undefined) {
      await db.query(
        `INSERT INTO system_platform_settings (key, value, updated_at)
         VALUES ('accent_color', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [payload.accentColor.trim()],
      );
    }

    await SuperService.logAudit("sys", "Platform global settings updated by Super Admin.");

    return await SuperService.getPlatformSettings();
  }

  /**
   * Generates a new API Key.
   */
  static async generateApiKey() {
    const newKey = "pk_live_" + crypto.randomBytes(24).toString("hex");
    await db.query(
      `INSERT INTO system_platform_settings (key, value, updated_at)
       VALUES ('public_api_key', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [newKey],
    );

    await SuperService.logAudit("sec", "A new Public API Key was generated by Super Admin.");
    return { apiKey: newKey };
  }

  /**
   * Revokes an API Key or Webhook secret.
   */
  static async revokeKey(keyType: "api_key" | "webhook") {
    if (keyType === "api_key") {
      const rotated = "pk_live_" + crypto.randomBytes(24).toString("hex");
      await db.query(
        `UPDATE system_platform_settings SET value = $1, updated_at = NOW() WHERE key = 'public_api_key';`,
        [rotated],
      );
      await SuperService.logAudit("sec", "Public API Key revoked and regenerated by Super Admin.");
      return { apiKey: rotated };
    } else {
      const rotated = "whsec_" + crypto.randomBytes(24).toString("hex");
      await db.query(
        `UPDATE system_platform_settings SET value = $1, updated_at = NOW() WHERE key = 'webhook_secret';`,
        [rotated],
      );
      await SuperService.logAudit("sec", "Webhook Secret revoked and regenerated by Super Admin.");
      return { webhookSecret: rotated };
    }
  }

  // ==========================================
  // Support Tickets Subsystem (Phase 3)
  // ==========================================

  /**
   * Retrieves all support tickets.
   */
  static async getSupportTickets() {
    const { rows } = await db.query(
      `SELECT t.id, t.ticket_number AS "ticketNumber", t.title, t.description, 
              t.status, t.priority, t.opened_at AS "openedAt",
              COALESCE(o.name, 'Unknown Workspace') AS "orgName",
              o.id AS "organizationId"
       FROM support_tickets t
       LEFT JOIN organizations o ON t.organization_id = o.id
       ORDER BY t.opened_at DESC;`,
    );
    return rows;
  }

  /**
   * Creates a new support ticket.
   */
  static async createSupportTicket(payload: {
    title: string;
    organizationId: string;
    description?: string;
    priority?: string;
  }) {
    const ticketNum = "TICK-" + Math.floor(1000 + Math.random() * 9000);
    const { rows } = await db.query(
      `INSERT INTO support_tickets (ticket_number, title, organization_id, description, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING id, ticket_number AS "ticketNumber", title, description, status, priority, opened_at AS "openedAt";`,
      [
        ticketNum,
        payload.title.trim(),
        payload.organizationId,
        payload.description?.trim() || null,
        payload.priority || "medium",
      ],
    );

    await SuperService.logAudit("info", `Support ticket #${ticketNum} ("${payload.title}") opened.`);

    return rows[0];
  }

  /**
   * Updates a support ticket status.
   */
  static async updateSupportTicket(id: string, payload: { status?: string; priority?: string }) {
    const updates: string[] = ["updated_at = NOW()"];
    const values: any[] = [id];

    if (payload.status !== undefined) {
      values.push(payload.status);
      updates.push(`status = $${values.length}`);
    }
    if (payload.priority !== undefined) {
      values.push(payload.priority);
      updates.push(`priority = $${values.length}`);
    }

    const { rows } = await db.query(
      `UPDATE support_tickets
       SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING id, ticket_number AS "ticketNumber", title, status, priority, opened_at AS "openedAt";`,
      values,
    );

    if (!rows[0]) {
      throw new Error(`Support ticket with ID '${id}' not found.`);
    }

    await SuperService.logAudit(
      "info",
      `Support ticket #${rows[0].ticketNumber} updated to '${rows[0].status}'.`,
    );

    return rows[0];
  }

  /**
   * Deletes a support ticket.
   */
  static async deleteSupportTicket(id: string) {
    await db.query(`DELETE FROM support_tickets WHERE id = $1;`, [id]);
    return { id };
  }

  /**
   * Retrieves all replies for a support ticket.
   */
  static async getTicketReplies(ticketId: string) {
    const { rows } = await db.query(
      `SELECT id, ticket_id AS "ticketId", sender_id AS "senderId", 
              sender_name AS "senderName", sender_role AS "senderRole", 
              message, created_at AS "createdAt"
       FROM support_ticket_replies
       WHERE ticket_id = $1
       ORDER BY created_at ASC;`,
      [ticketId],
    );
    return rows;
  }

  /**
   * Adds a reply to a support ticket thread.
   */
  static async createTicketReply(
    ticketId: string,
    payload: {
      senderId?: string;
      senderName: string;
      senderRole?: string;
      message: string;
    },
  ) {
    const id = "rep-" + crypto.randomBytes(6).toString("hex");
    const { rows } = await db.query(
      `INSERT INTO support_ticket_replies (id, ticket_id, sender_id, sender_name, sender_role, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, ticket_id AS "ticketId", sender_id AS "senderId", 
                 sender_name AS "senderName", sender_role AS "senderRole", 
                 message, created_at AS "createdAt";`,
      [
        id,
        ticketId,
        payload.senderId || null,
        payload.senderName,
        payload.senderRole || "Super Admin",
        payload.message.trim(),
      ],
    );

    // Update ticket updated_at
    await db.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1;`, [ticketId]);

    await SuperService.logAudit(
      "info",
      `Reply added to support ticket (${payload.senderName}: "${payload.message.slice(0, 50)}...").`,
    );

    return rows[0];
  }

  // ==========================================
  // Billing & Invoices Subsystem (Phase 3)
  // ==========================================

  /**
   * Retrieves all real invoices, ensuring every active organization has an invoice synchronized.
   */
  static async getInvoices() {
    // 1. Ensure all existing organizations have an active invoice record
    const { rows: orgsWithoutInvoices } = await db.query(
      `SELECT o.id, o.name, COALESCE(o.plan, 'Pro') AS plan, o.created_at
       FROM organizations o
       LEFT JOIN invoices i ON i.organization_id = o.id
       WHERE i.id IS NULL;`,
    );

    for (const org of orgsWithoutInvoices) {
      const plan = org.plan || "Pro";
      const amt = plan === "Enterprise" ? "₹999 /mo" : plan === "Basic" ? "₹200 /mo" : "₹450 /mo";
      const dtStr = new Date(org.created_at || Date.now()).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const invNum = "INV-" + new Date().getFullYear() + "-" + Math.floor(100 + Math.random() * 900);
      try {
        await db.query(
          `INSERT INTO invoices (invoice_number, organization_id, plan, amount, status, date)
           VALUES ($1, $2, $3, $4, 'paid', $5)
           ON CONFLICT DO NOTHING;`,
          [invNum, org.id, plan, amt, dtStr],
        );
      } catch (err) {
        console.error("Auto-sync invoice error:", err);
      }
    }

    // 2. Fetch all invoices joined with organization details
    const { rows } = await db.query(
      `SELECT i.id, i.invoice_number AS "invoiceNumber", i.plan, i.amount, 
              i.status, i.date, i.created_at AS "createdAt",
              COALESCE(o.name, 'Workspace') AS "orgName",
              o.id AS "organizationId"
       FROM invoices i
       INNER JOIN organizations o ON i.organization_id = o.id
       ORDER BY i.created_at DESC;`,
    );
    return rows;
  }

  /**
   * Records a new invoice / billing transaction.
   */
  static async createInvoice(payload: {
    organizationId: string;
    plan: string;
    amount: string;
    status?: string;
    date?: string;
  }) {
    const invoiceNum = "INV-" + new Date().getFullYear() + "-" + Math.floor(100 + Math.random() * 900);
    const dateStr = payload.date || new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const { rows } = await db.query(
      `INSERT INTO invoices (invoice_number, organization_id, plan, amount, status, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, invoice_number AS "invoiceNumber", plan, amount, status, date;`,
      [invoiceNum, payload.organizationId, payload.plan, payload.amount, payload.status || "paid", dateStr],
    );

    await SuperService.logAudit("info", `Invoice #${invoiceNum} generated for workspace.`);

    return rows[0];
  }

  /**
   * Generates a printable tax invoice HTML document with styling and auto-print trigger.
   */
  static async getInvoicePrintableHtml(invoiceId: string) {
    const { rows } = await db.query(
      `SELECT i.id, i.invoice_number AS "invoiceNumber", i.plan, i.amount, 
              i.status, i.date, i.created_at AS "createdAt",
              COALESCE(o.name, 'Valued Workspace Client') AS "orgName",
              o.phone,
              u.name AS "ownerName", u.email AS "ownerEmail"
       FROM invoices i
       LEFT JOIN organizations o ON i.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT name, email FROM users usr
         WHERE usr.organization_id = o.id
         ORDER BY (usr.role = 'Admin') DESC, usr.created_at ASC
         LIMIT 1
       ) u ON true
       WHERE i.id = $1 OR i.invoice_number = $1;`,
      [invoiceId],
    );

    if (!rows[0]) {
      throw new Error(`Invoice '${invoiceId}' not found.`);
    }

    const inv = rows[0];
    const dateFormatted = inv.date || new Date(inv.createdAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${inv.invoiceNumber} — Collabix Enterprise</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #1a1a1a;
      background: #ffffff;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f3f4f6;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-title {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #D96B43;
    }
    .logo-sub {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      background: #dcfce7;
      color: #166534;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 32px;
    }
    .meta-col h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .meta-col p {
      margin: 4px 0;
      font-size: 14px;
      color: #1f2937;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 32px 0;
    }
    th {
      text-align: left;
      padding: 12px;
      background: #f9fafb;
      font-size: 12px;
      text-transform: uppercase;
      color: #4b5563;
      border-bottom: 1px solid #e5e7eb;
    }
    td {
      padding: 16px 12px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
    }
    .text-right {
      text-align: right;
    }
    .total-row td {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      border-top: 2px solid #e5e7eb;
    }
    .footer {
      text-align: center;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #f3f4f6;
      font-size: 12px;
      color: #9ca3af;
    }
    @media print {
      body { padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div class="logo-container">
        <div>
          <div class="logo-title">COLLABIX</div>
          <div class="logo-sub">Enterprise Platform</div>
        </div>
      </div>
      <div style="text-align: right;">
        <span class="badge">${inv.status.toUpperCase()}</span>
        <h2 style="margin: 8px 0 0 0; font-size: 20px;">#${inv.invoiceNumber}</h2>
        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;">Date: ${dateFormatted}</p>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-col">
        <h3>Billed To:</h3>
        <p><strong>${inv.orgName}</strong></p>
        <p>${inv.ownerName ? `Attn: ${inv.ownerName}` : ""}</p>
        <p>${inv.ownerEmail || "billing@workspace.org"}</p>
        ${inv.phone ? `<p>${inv.phone}</p>` : ""}
      </div>
      <div class="meta-col text-right">
        <h3>Issued By:</h3>
        <p><strong>Collabix Technologies Pvt Ltd</strong></p>
        <p>support@collabix.in</p>
        <p>GSTIN: 27AABCS1429B1Z8</p>
        <p>Mumbai, Maharashtra, India</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Plan Tier</th>
          <th>Billing Cycle</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>Collabix Platform SaaS Subscription</strong><br>
            <span style="color: #6b7280; font-size: 12px;">Full workspace access, screen monitoring & team collaboration</span>
          </td>
          <td>${inv.plan}</td>
          <td>Monthly Recurring</td>
          <td class="text-right">${inv.amount}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3" class="text-right">Total Paid:</td>
          <td class="text-right">${inv.amount}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <p>Thank you for choosing Collabix. This is a computer-generated tax invoice and requires no physical signature.</p>
    </div>
  </div>
  <script>
    if (window.location.search.includes('print=true')) {
      window.print();
    }
  </script>
</body>
</html>`;
  }
}
