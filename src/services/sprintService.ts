import { db } from "../db/index.js";

export interface SprintInput {
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export class SprintService {
  static async getById(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const { rows } = await db.query(
      "SELECT * FROM sprints WHERE id = $1 AND organization_id = $2;",
      [id, organizationId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
    };
  }

  static async create(sprint: SprintInput, organizationId?: string | null) {
    const id = `s${Date.now()}`;
    const { rows } = await db.query(
      `INSERT INTO sprints (id, project_id, name, start_date, end_date, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [
        id,
        sprint.projectId,
        sprint.name,
        sprint.startDate,
        sprint.endDate,
        organizationId || null,
      ],
    );
    const created = rows[0];
    if (!created) return null;
    return {
      id: created.id,
      projectId: created.project_id,
      name: created.name,
      startDate: created.start_date,
      endDate: created.end_date,
    };
  }

  static async update(
    id: string,
    patch: Partial<SprintInput>,
    organizationId?: string | null,
  ) {
    if (!organizationId) return null;
    const existing = await this.getById(id, organizationId);
    if (!existing) return null;

    const fieldsToUpdate: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (patch.projectId !== undefined) {
      fieldsToUpdate.push(`project_id = $${index++}`);
      values.push(patch.projectId);
    }
    if (patch.name !== undefined) {
      fieldsToUpdate.push(`name = $${index++}`);
      values.push(patch.name);
    }
    if (patch.startDate !== undefined) {
      fieldsToUpdate.push(`start_date = $${index++}`);
      values.push(patch.startDate);
    }
    if (patch.endDate !== undefined) {
      fieldsToUpdate.push(`end_date = $${index++}`);
      values.push(patch.endDate);
    }

    if (fieldsToUpdate.length === 0) {
      return this.getById(id, organizationId);
    }

    values.push(id, organizationId);
    const query = `UPDATE sprints SET ${fieldsToUpdate.join(", ")} WHERE id = $${index} AND organization_id = $${index + 1} RETURNING *;`;
    const { rows } = await db.query(query, values);
    const updated = rows[0];
    if (!updated) return null;
    return {
      id: updated.id,
      projectId: updated.project_id,
      name: updated.name,
      startDate: updated.start_date,
      endDate: updated.end_date,
    };
  }

  static async delete(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const { rows } = await db.query(
      "DELETE FROM sprints WHERE id = $1 AND organization_id = $2 RETURNING *;",
      [id, organizationId],
    );
    const deleted = rows[0];
    if (!deleted) return null;
    return {
      id: deleted.id,
      projectId: deleted.project_id,
      name: deleted.name,
      startDate: deleted.start_date,
      endDate: deleted.end_date,
    };
  }
}
