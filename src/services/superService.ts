import { db } from "../db/index.js";

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
   * Deletes an organization entirely from the database.
   */
  static async deleteOrganization(id: string) {
    const { rowCount } = await db.query(
      `DELETE FROM organizations WHERE id = $1;`,
      [id],
    );

    if (rowCount === 0) {
      throw new Error(`Organization with ID '${id}' not found.`);
    }

    return true;
  }
}
