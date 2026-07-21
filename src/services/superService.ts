import crypto from "crypto";
import { db } from "../db/index.js";
import { hashToken } from "./authService.js";

export class SuperService {
  /**
   * Retrieves all organizations, joining with their admin owner profile details.
   */
  static async getAllOrganizations() {
    const { rows } = await db.query(
      `SELECT o.id, o.name, o.phone, o.subscription_status AS "subscriptionStatus", 
              o.trial_ends_at AS "trialEndsAt", o.is_approved AS "isApproved", 
              o.created_at AS "createdAt",
              u.name AS "ownerName", u.email AS "ownerEmail"
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id AND u.role = 'Admin'
       ORDER BY o.created_at DESC;`,
    );
    return rows;
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
}
