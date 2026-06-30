import { db } from "../db/index.js";

export interface LeaveInput {
  memberId: string;
  type: string;
  startDate: string;
  endDate: string;
}

export class LeaveService {
  static async getById(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const { rows } = await db.query(
      "SELECT * FROM leaves WHERE id = $1 AND organization_id = $2;",
      [id, organizationId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      memberId: r.member_id,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
    };
  }

  static async create(leave: LeaveInput, organizationId?: string | null) {
    const id = `l${Date.now()}`;
    const { rows } = await db.query(
      `INSERT INTO leaves (id, member_id, type, start_date, end_date, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [
        id,
        leave.memberId,
        leave.type,
        leave.startDate,
        leave.endDate,
        organizationId || null,
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
    };
  }

  static async delete(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const { rows } = await db.query(
      "DELETE FROM leaves WHERE id = $1 AND organization_id = $2 RETURNING *;",
      [id, organizationId],
    );
    const deleted = rows[0];
    if (!deleted) return null;
    return {
      id: deleted.id,
      memberId: deleted.member_id,
      type: deleted.type,
      startDate: deleted.start_date,
      endDate: deleted.end_date,
    };
  }
}
