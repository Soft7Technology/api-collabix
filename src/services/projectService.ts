import { db, pool } from "../db/index.js";

export interface ProjectInput {
  name: string;
  description: string;
  status: string;
  dueDate: string;
  color: string;
  memberIds?: string[];
}

export class ProjectService {
  static async getAll(userCtx?: {
    id: string;
    roleName: string;
    roleRank: number;
    departmentId: string | null;
    organizationId?: string | null;
    isSuperAdmin?: boolean;
  }) {
    if (userCtx && !userCtx.organizationId && !userCtx.isSuperAdmin) {
      return [];
    }

    if (!userCtx || userCtx.roleRank <= 2) {
      // Admin, Manager or no context: return all projects for this organization
      const { rows } = await db.query(
        `
        SELECT p.*, COALESCE(array_agg(pm.member_id) FILTER (WHERE pm.member_id IS NOT NULL), '{}') AS "memberIds"
        FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.organization_id = $1
        GROUP BY p.id;
      `,
        [userCtx?.organizationId || null],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        progress: Number(r.progress),
        taskCount: Number(r.task_count),
        dueDate: r.due_date,
        color: r.color,
        memberIds: r.memberIds,
      }));
    }

    if (userCtx.roleRank === 3) {
      // Team leader, Hr: only projects they are member of (similar to Teammates)
      const { rows } = await db.query(
        `
        SELECT p.*, COALESCE(array_agg(pm.member_id) FILTER (WHERE pm.member_id IS NOT NULL), '{}') AS "memberIds"
        FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        WHERE p.organization_id = $2
        GROUP BY p.id
        HAVING $1 = ANY(COALESCE(array_agg(pm.member_id) FILTER (WHERE pm.member_id IS NOT NULL), '{}'));
      `,
        [userCtx.id, userCtx.organizationId || null],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        progress: Number(r.progress),
        taskCount: Number(r.task_count),
        dueDate: r.due_date,
        color: r.color,
        memberIds: r.memberIds,
      }));
    }

    // Teammate: only projects they are member of
    const { rows } = await db.query(
      `
      SELECT p.*, COALESCE(array_agg(pm.member_id) FILTER (WHERE pm.member_id IS NOT NULL), '{}') AS "memberIds"
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id
      WHERE p.organization_id = $2
      GROUP BY p.id
      HAVING $1 = ANY(COALESCE(array_agg(pm.member_id) FILTER (WHERE pm.member_id IS NOT NULL), '{}'));
    `,
      [userCtx.id, userCtx.organizationId || null],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      progress: Number(r.progress),
      taskCount: Number(r.task_count),
      dueDate: r.due_date,
      color: r.color,
      memberIds: r.memberIds,
    }));
  }

  static async getById(
    id: string,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    },
  ) {
    const projects = await this.getAll(userCtx);
    return projects.find((p) => p.id === id) || null;
  }

  static async create(project: ProjectInput, organizationId?: string | null) {
    const id = `p${Date.now()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO projects (id, name, description, status, progress, task_count, due_date, color, organization_id)
         VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7)
         RETURNING *;`,
        [
          id,
          project.name,
          project.description,
          project.status,
          project.dueDate,
          project.color,
          organizationId || null,
        ],
      );

      const createdProject = rows[0];

      if (project.memberIds && project.memberIds.length > 0) {
        for (const memberId of project.memberIds) {
          await client.query(
            "INSERT INTO project_members (project_id, member_id) VALUES ($1, $2);",
            [id, memberId],
          );
        }
      }

      await client.query("COMMIT");
      return {
        id: createdProject.id,
        name: createdProject.name,
        description: createdProject.description,
        status: createdProject.status,
        progress: 0,
        taskCount: 0,
        dueDate: createdProject.due_date,
        color: createdProject.color,
        memberIds: project.memberIds || [],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(
    id: string,
    patch: Partial<ProjectInput> & { progress?: number },
    organizationId?: string | null,
  ) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Dynamically build project fields updates
      const fieldsToUpdate: string[] = [];
      const values: any[] = [];
      let index = 1;

      if (patch.name !== undefined) {
        fieldsToUpdate.push(`name = $${index++}`);
        values.push(patch.name);
      }
      if (patch.description !== undefined) {
        fieldsToUpdate.push(`description = $${index++}`);
        values.push(patch.description);
      }
      if (patch.status !== undefined) {
        fieldsToUpdate.push(`status = $${index++}`);
        values.push(patch.status);
      }
      if (patch.progress !== undefined) {
        fieldsToUpdate.push(`progress = $${index++}`);
        values.push(patch.progress);
      }
      if (patch.dueDate !== undefined) {
        fieldsToUpdate.push(`due_date = $${index++}`);
        values.push(patch.dueDate);
      }
      if (patch.color !== undefined) {
        fieldsToUpdate.push(`color = $${index++}`);
        values.push(patch.color);
      }

      let updatedProject = null;
      if (fieldsToUpdate.length > 0) {
        values.push(id, organizationId);
        const query = `UPDATE projects SET ${fieldsToUpdate.join(", ")} WHERE id = $${index} AND organization_id = $${index + 1} RETURNING *;`;
        const { rows } = await client.query(query, values);
        updatedProject = rows[0];
      } else {
        const { rows } = await client.query(
          "SELECT * FROM projects WHERE id = $1 AND organization_id = $2;",
          [id, organizationId],
        );
        updatedProject = rows[0];
      }

      if (!updatedProject) {
        await client.query("ROLLBACK");
        return null;
      }

      // Handle member updates
      if (patch.memberIds !== undefined) {
        const { rows: existingMemberRows } = await client.query(
          "SELECT member_id FROM project_members WHERE project_id = $1;",
          [id],
        );
        const existingMemberIds = existingMemberRows.map((r) => r.member_id);
        const removedMemberIds = existingMemberIds.filter(
          (mid) => !patch.memberIds!.includes(mid),
        );

        await client.query(
          "DELETE FROM project_members WHERE project_id = $1;",
          [id],
        );
        for (const memberId of patch.memberIds) {
          await client.query(
            "INSERT INTO project_members (project_id, member_id) VALUES ($1, $2);",
            [id, memberId],
          );
        }

        if (removedMemberIds.length > 0) {
          await client.query(
            "UPDATE tasks SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = ANY($2);",
            [id, removedMemberIds],
          );
        }
      }

      // Fetch the updated members mapping
      const { rows: memberRows } = await client.query(
        "SELECT member_id FROM project_members WHERE project_id = $1;",
        [id],
      );
      const memberIds = memberRows.map((r) => r.member_id);

      await client.query("COMMIT");
      return {
        id: updatedProject.id,
        name: updatedProject.name,
        description: updatedProject.description,
        status: updatedProject.status,
        progress: Number(updatedProject.progress),
        taskCount: Number(updatedProject.task_count),
        dueDate: updatedProject.due_date,
        color: updatedProject.color,
        memberIds,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const { rows } = await db.query(
      "DELETE FROM projects WHERE id = $1 AND organization_id = $2 RETURNING *;",
      [id, organizationId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      progress: Number(r.progress),
      taskCount: Number(r.task_count),
      dueDate: r.due_date,
      color: r.color,
    };
  }
}
