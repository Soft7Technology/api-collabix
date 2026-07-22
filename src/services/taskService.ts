import { db, pool } from "../db/index.js";
import { ProjectService } from "./projectService.js";

export interface TaskInput {
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  dueDate: string;
  sprintId?: string;
  attachments?: any[];
}

export class TaskService {
  static async getAll(
    projectId?: string,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    },
  ) {
    if (userCtx && !userCtx.organizationId && !userCtx.isSuperAdmin) {
      return [];
    }

    let queryStr = "SELECT * FROM tasks";
    const params: any[] = [];
    let index = 1;

    const conditions: string[] = [];

    if (userCtx && userCtx.organizationId) {
      conditions.push(`organization_id = $${index++}`);
      params.push(userCtx.organizationId);
    }

    if (projectId) {
      conditions.push(`project_id = $${index++}`);
      params.push(projectId);
    }

    if (userCtx && userCtx.roleRank > 2) {
      if (userCtx.roleRank === 3) {
        // Team leader / Hr: visible projects
        const visibleProjects = await ProjectService.getAll(userCtx);
        const visibleProjectIds = visibleProjects.map((p) => p.id);
        if (visibleProjectIds.length === 0) {
          return []; // No visible projects -> no tasks
        }
        conditions.push(`project_id = ANY($${index})`);
        params.push(visibleProjectIds);
      } else if (userCtx.roleRank === 4) {
        // Teammate: projects they are member of (same as rank 3)
        const visibleProjects = await ProjectService.getAll(userCtx);
        const visibleProjectIds = visibleProjects.map((p) => p.id);
        if (visibleProjectIds.length === 0) {
          return []; // No visible projects -> no tasks
        }
        conditions.push(`project_id = ANY($${index})`);
        params.push(visibleProjectIds);
      }
    }

    if (conditions.length > 0) {
      queryStr += " WHERE " + conditions.join(" AND ");
    }
    queryStr += " ORDER BY created_at DESC;";

    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => {
      const {
        assignee_id,
        project_id,
        due_date,
        created_at,
        updated_at,
        sprint_id,
        ...rest
      } = r;

      return {
        ...rest,
        assigneeId: assignee_id,
        projectId: project_id,
        dueDate: due_date,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
      };
    });
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
    const taskResult = await db.query("SELECT * FROM tasks WHERE id = $1;", [
      id,
    ]);
    const r = taskResult.rows[0];
    if (!r) return null;

    if (userCtx) {
      if (userCtx.organizationId) {
        if (r.organization_id !== userCtx.organizationId) {
          return null;
        }
      } else if (!userCtx.isSuperAdmin) {
        return null;
      }
    }

    const task = {
      ...r,
      assigneeId: r.assignee_id,
      projectId: r.project_id,
      dueDate: r.due_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sprintId: r.sprint_id,
    };

    if (userCtx && userCtx.roleRank > 2) {
      const visibleProjects = await ProjectService.getAll(userCtx);
      const hasAccess = visibleProjects.some((p) => p.id === task.projectId);
      if (!hasAccess) return null;
    }

    return task;
  }

  static async create(task: TaskInput, organizationId?: string | null) {
    // Validate assignees exist in project
    const { rows: members } = await db.query(
      "SELECT member_id FROM project_members WHERE project_id = $1;",
      [task.projectId],
    );
    const memberIds = new Set(members.map((m) => m.member_id));
    const assignees = (task.assigneeId || "")
      .split(",")
      .map((id: string) => id.trim())
      .filter(Boolean);
    for (const assignee of assignees) {
      if (!memberIds.has(assignee)) {
        throw new Error("this user is not in project");
      }
    }

    const id = `t${Date.now()}`;
    const createdAt = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO tasks (id, title, description, status, priority, assignee_id, project_id, due_date, created_at, updated_at, sprint_id, organization_id, attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         RETURNING *;`,
        [
          id,
          task.title,
          task.description || "",
          task.status,
          task.priority,
          task.assigneeId,
          task.projectId,
          task.dueDate,
          createdAt,
          createdAt,
          task.sprintId || null,
          organizationId || null,
          JSON.stringify(task.attachments || []),
        ],
      );

      await client.query(
        `UPDATE projects 
         SET task_count = (SELECT COUNT(*) FROM tasks WHERE project_id = $1),
             progress = COALESCE(
               ROUND(
                 (SELECT COUNT(*) FILTER (WHERE status = 'done') * 100.0 / NULLIF(COUNT(*), 0)
                  FROM tasks
                  WHERE project_id = $1)
               ), 0
             )
         WHERE id = $1;`,
        [task.projectId],
      );

      await client.query("COMMIT");
      const created = rows[0];
      const {
        assignee_id,
        project_id,
        due_date,
        created_at,
        updated_at,
        sprint_id,
        ...rest
      } = created;

      return {
        ...rest,
        assigneeId: assignee_id,
        projectId: project_id,
        dueDate: due_date,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(id: string, patch: Partial<TaskInput>) {
    const currentTask = await this.getById(id);
    if (!currentTask) {
      throw new Error("Task not found");
    }
    const finalProjectId =
      patch.projectId !== undefined ? patch.projectId : currentTask.projectId;
    const finalAssigneeId =
      patch.assigneeId !== undefined
        ? patch.assigneeId
        : currentTask.assigneeId;

    const { rows: members } = await db.query(
      "SELECT member_id FROM project_members WHERE project_id = $1;",
      [finalProjectId],
    );
    const memberIds = new Set(members.map((m) => m.member_id));
    const assignees = (finalAssigneeId || "")
      .split(",")
      .map((aid: string) => aid.trim())
      .filter(Boolean);
    for (const assignee of assignees) {
      if (!memberIds.has(assignee)) {
        throw new Error("this user is not in project");
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const oldTaskRes = await client.query(
        "SELECT project_id FROM tasks WHERE id = $1;",
        [id],
      );
      const oldProjectId = oldTaskRes.rows[0]?.project_id;

      const fieldsToUpdate: string[] = [];
      const values: any[] = [];
      let index = 1;

      if (patch.title !== undefined) {
        fieldsToUpdate.push(`title = $${index++}`);
        values.push(patch.title);
      }
      if (patch.description !== undefined) {
        fieldsToUpdate.push(`description = $${index++}`);
        values.push(patch.description);
      }
      if (patch.status !== undefined) {
        fieldsToUpdate.push(`status = $${index++}`);
        values.push(patch.status);
      }
      if (patch.priority !== undefined) {
        fieldsToUpdate.push(`priority = $${index++}`);
        values.push(patch.priority);
      }
      if (patch.assigneeId !== undefined) {
        fieldsToUpdate.push(`assignee_id = $${index++}`);
        values.push(patch.assigneeId);
      }
      if (patch.projectId !== undefined) {
        fieldsToUpdate.push(`project_id = $${index++}`);
        values.push(patch.projectId);
      }
      if (patch.dueDate !== undefined) {
        fieldsToUpdate.push(`due_date = $${index++}`);
        values.push(patch.dueDate);
      }
      // 👈 Handle dynamic updates for sprint_id
      if (patch.sprintId !== undefined) {
        fieldsToUpdate.push(`sprint_id = $${index++}`);
        values.push(patch.sprintId);
      }
      if (patch.attachments !== undefined) {
        fieldsToUpdate.push(`attachments = $${index++}::jsonb`);
        values.push(JSON.stringify(patch.attachments || []));
      }

      if (fieldsToUpdate.length === 0) {
        await client.query("ROLLBACK");
        return this.getById(id);
      }

      fieldsToUpdate.push(`updated_at = $${index++}`);
      values.push(new Date().toISOString());

      values.push(id);
      const query = `UPDATE tasks SET ${fieldsToUpdate.join(", ")} WHERE id = $${index} RETURNING *;`;
      const { rows } = await client.query(query, values);

      const updated = rows[0];
      if (updated) {
        const projectIdsToUpdate = new Set<string>();
        if (oldProjectId) projectIdsToUpdate.add(oldProjectId);
        if (updated.project_id) projectIdsToUpdate.add(updated.project_id);

        for (const pId of projectIdsToUpdate) {
          await client.query(
            `UPDATE projects 
             SET task_count = (SELECT COUNT(*) FROM tasks WHERE project_id = $1),
                 progress = COALESCE(
                   ROUND(
                     (SELECT COUNT(*) FILTER (WHERE status = 'done') * 100.0 / NULLIF(COUNT(*), 0)
                      FROM tasks
                      WHERE project_id = $1)
                   ), 0
                 )
             WHERE id = $1;`,
            [pId],
          );
        }
      }

      await client.query("COMMIT");
      if (!updated) return null;
      const {
        assignee_id,
        project_id,
        due_date,
        created_at,
        updated_at,
        sprint_id,
        ...rest
      } = updated;

      return {
        ...rest,
        assigneeId: assignee_id,
        projectId: project_id,
        dueDate: due_date,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(id: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        "DELETE FROM tasks WHERE id = $1 RETURNING *;",
        [id],
      );
      const deletedTask = rows[0];

      if (deletedTask) {
        await client.query(
          `UPDATE projects 
           SET task_count = (SELECT COUNT(*) FROM tasks WHERE project_id = $1),
               progress = COALESCE(
                 ROUND(
                   (SELECT COUNT(*) FILTER (WHERE status = 'done') * 100.0 / NULLIF(COUNT(*), 0)
                    FROM tasks
                    WHERE project_id = $1)
                 ), 0
               )
           WHERE id = $1;`,
          [deletedTask.project_id],
        );
      }

      await client.query("COMMIT");
      if (!deletedTask) return null;
      const {
        assignee_id,
        project_id,
        due_date,
        created_at,
        updated_at,
        sprint_id,
        ...rest
      } = deletedTask;

      return {
        ...rest,
        assigneeId: assignee_id,
        projectId: project_id,
        dueDate: due_date,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
