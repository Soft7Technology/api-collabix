import { db } from "../db/index.js";

export interface LeaveInput {
  memberId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export class LeaveService {
  static async getById(
    id: string,
    organizationId?: string | null,
    isSuperAdmin?: boolean,
  ) {
    let queryStr = "SELECT * FROM leaves WHERE id = $1";
    const params: any[] = [id];
    if (organizationId && !isSuperAdmin) {
      queryStr += " AND (organization_id = $2 OR organization_id IS NULL)";
      params.push(organizationId);
    }
    queryStr += ";";

    const { rows } = await db.query(queryStr, params);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      memberId: r.member_id,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      reason: r.reason,
      attachmentUrl: r.attachment_url,
      attachmentName: r.attachment_name,
    };
  }
  static async canReview(
    leaveId: string,
    organizationId: string,
    reviewerId: string,
    roleName: string,
  ) {
    const { rows } = await db.query(
      `SELECT 1
     FROM leaves l
     JOIN users employee ON employee.id = l.member_id
     WHERE l.id = $1
       AND l.organization_id = $2
       AND employee.organization_id = $2
       AND (
         $3 = 'Admin'
         OR ($3 = 'Manager' AND employee.manager_id = $4)
       )
     LIMIT 1`,
      [leaveId, organizationId, roleName, reviewerId],
    );

    return rows.length > 0;
  }
  static async create(leave: LeaveInput, organizationId?: string | null) {
    const id = `l${Date.now()}`;
    let resolvedOrgId = organizationId;
    if (!resolvedOrgId && leave.memberId) {
      const uRes = await db.query(
        "SELECT organization_id FROM users WHERE id = $1;",
        [leave.memberId],
      );
      resolvedOrgId = uRes.rows[0]?.organization_id || null;
    }

    const { rows } = await db.query(
      `INSERT INTO leaves (id, member_id, type, start_date, end_date, status, reason, attachment_url, attachment_name, organization_id)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9)
       RETURNING *;`,
      [
        id,
        leave.memberId,
        leave.type,
        leave.startDate,
        leave.endDate,
        leave.reason || null,
        leave.attachmentUrl || null,
        leave.attachmentName || null,
        resolvedOrgId || null,
      ],
    );
    const created = rows[0];
    if (!created) return null;
    return {
      id: created.id,
      memberId: created.member_id,
      type: created.type,
      startDate: created.start_date,
      endDate: created.end_date,
      status: created.status,
      reason: created.reason,
      attachmentUrl: created.attachment_url,
      attachmentName: created.attachment_name,
    };
  }
  static async getLeaveRequestRecipients(
    memberId: string,
    organizationId: string,
  ) {
    const { rows } = await db.query(
      `
    SELECT DISTINCT
      recipient.id,
      recipient.name,
      recipient.email,
      recipient_role.name AS role_name,
      employee.name AS employee_name
    FROM users employee
    INNER JOIN users recipient
      ON recipient.organization_id = employee.organization_id
    INNER JOIN roles recipient_role
      ON recipient_role.id = recipient.role_id
    WHERE employee.id = $1
      AND employee.organization_id = $2
      AND employee.status = 'ACTIVE'
      AND recipient.status = 'ACTIVE'
      AND recipient.is_super_admin = false
      AND recipient.email IS NOT NULL
      AND TRIM(recipient.email) <> ''
      AND (
        recipient_role.name = 'Admin'
        OR recipient.id = employee.manager_id
      )
    `,
      [memberId, organizationId],
    );

    return rows;
  }
  static async updateStatus(
    id: string,
    status: "APPROVED" | "REJECTED",
    organizationId: string,
    reviewerId: string,
    rejectionReason?: string,
  ) {
    if (!organizationId || !reviewerId) {
      throw new Error("Organization and reviewer are required");
    }

    const { rows } = await db.query(
      `UPDATE leaves
     SET
       status = $1,
       reviewed_by = $2,
       reviewed_at = NOW(),
       rejection_reason = $3
     WHERE id = $4
       AND organization_id = $5
       AND status = 'PENDING'
     RETURNING *`,
      [
        status,
        reviewerId,
        status === "REJECTED" ? rejectionReason || null : null,
        id,
        organizationId,
      ],
    );

    const updated = rows[0];

    if (!updated) return null;

    return {
      id: updated.id,
      memberId: updated.member_id,
      type: updated.type,
      startDate: updated.start_date,
      endDate: updated.end_date,
      status: updated.status,
      reason: updated.reason,
      attachmentUrl: updated.attachment_url,
      attachmentName: updated.attachment_name,
      reviewedBy: updated.reviewed_by,
      reviewedAt: updated.reviewed_at,
      rejectionReason: updated.rejection_reason,
    };
  }

  static async delete(
    id: string,
    organizationId?: string | null,
    isSuperAdmin?: boolean,
  ) {
    let queryStr = `DELETE FROM leaves WHERE id = $1`;
    const params: any[] = [id];
    if (organizationId && !isSuperAdmin) {
      queryStr += ` AND (organization_id = $2 OR organization_id IS NULL)`;
      params.push(organizationId);
    }
    queryStr += ` RETURNING *;`;

    const { rows } = await db.query(queryStr, params);
    const deleted = rows[0];
    if (!deleted) return null;
    return {
      id: deleted.id,
      memberId: deleted.member_id,
      type: deleted.type,
      startDate: deleted.start_date,
      endDate: deleted.end_date,
      status: deleted.status,
      reason: deleted.reason,
      attachmentUrl: deleted.attachment_url,
      attachmentName: deleted.attachment_name,
    };
  }
}
