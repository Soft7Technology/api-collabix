import { db, pool } from "../db/index.js";
import { ProjectService } from "./projectService.js";
import { deleteFromR2 } from "./storageService.js";

function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export interface TaskInput {
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeId?: string;
  assigneeIds?: string[];
  projectId: string;
  dueDate?: string;
  startDate?: string;
  isStartDateAuto?: boolean;
  sprintId?: string;
  attachments?: any[];
  parentTaskId?: string | null;
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
    if (!userCtx?.organizationId) {
      const error: any = new Error("Organization ID is required to retrieve tasks.");
      error.status = 400;
      throw error;
    }

    let queryStr = "SELECT * FROM tasks";
    const params: any[] = [];
    let index = 1;

    const conditions: string[] = [];

    if (userCtx.organizationId) {
      conditions.push(`organization_id = $${index++}`);
      params.push(userCtx.organizationId);
    }

    if (projectId) {
      conditions.push(`project_id = $${index++}`);
      params.push(projectId);
    }

    if (userCtx && userCtx.roleRank > 2) {
      const visibleProjects = await ProjectService.getAll(userCtx);
      const visibleProjectIds = visibleProjects.map((p) => p.id);
      if (visibleProjectIds.length === 0) {
        return []; // No visible projects -> no tasks
      }
      conditions.push(`project_id = ANY($${index})`);
      params.push(visibleProjectIds);
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
        start_date,
        is_start_date_auto,
        created_at,
        updated_at,
        sprint_id,
        attachments,
        parent_task_id,
        ...rest
      } = r;

      const parsedAssigneeIds = (assignee_id || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      return {
        ...rest,
        assigneeId: assignee_id || "",
        assigneeIds: parsedAssigneeIds,
        projectId: project_id,
        dueDate: due_date || "",
        startDate: start_date || "",
        isStartDateAuto: !!is_start_date_auto,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
        attachments: attachments || [],
        parentTaskId: parent_task_id || null,
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
    if (!userCtx?.organizationId) {
      const error: any = new Error("Organization ID is required to retrieve tasks.");
      error.status = 400;
      throw error;
    }

    const taskResult = await db.query(
      "SELECT * FROM tasks WHERE id = $1 AND organization_id = $2;",
      [id, userCtx.organizationId],
    );
    const r = taskResult.rows[0];
    if (!r) return null;

    const parsedAssigneeIds = (r.assignee_id || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const task = {
      ...r,
      assigneeId: r.assignee_id || "",
      assigneeIds: parsedAssigneeIds,
      projectId: r.project_id,
      dueDate: r.due_date || "",
      startDate: r.start_date || "",
      isStartDateAuto: !!r.is_start_date_auto,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sprintId: r.sprint_id,
      attachments: r.attachments || [],
      parentTaskId: r.parent_task_id || null,
    };

    if (userCtx && userCtx.roleRank > 2) {
      const visibleProjects = await ProjectService.getAll(userCtx);
      const hasAccess = visibleProjects.some((p) => p.id === task.projectId);
      if (!hasAccess) return null;
    }

    return task;
  }

  static async create(task: TaskInput, organizationId?: string | null) {
    if (!organizationId) {
      const error: any = new Error("Organization ID is required to create a task.");
      error.status = 400;
      throw error;
    }

    // Resolve multi-assignees or scalar assigneeId
    let finalAssigneeId = task.assigneeId || "";
    if (Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0) {
      finalAssigneeId = task.assigneeIds.map((s: string) => s.trim()).filter(Boolean).join(", ");
    }

    // Validate sprint assignment matches task project
    if (task.sprintId) {
      const { rows: sprintRows } = await db.query(
        "SELECT id, project_id, organization_id FROM sprints WHERE id = $1;",
        [task.sprintId],
      );
      if (!sprintRows[0]) {
        const error: any = new Error(`Sprint with ID '${task.sprintId}' not found.`);
        error.status = 400;
        throw error;
      }
      if (sprintRows[0].project_id !== task.projectId) {
        const error: any = new Error(
          `Invalid sprint assignment: Sprint '${task.sprintId}' belongs to project '${sprintRows[0].project_id}', not '${task.projectId}'.`
        );
        error.status = 400;
        throw error;
      }
      if (organizationId && sprintRows[0].organization_id && sprintRows[0].organization_id !== organizationId) {
        const error: any = new Error(
          `Invalid sprint assignment: Sprint belongs to a different organization.`
        );
        error.status = 400;
        throw error;
      }
    }

    // Validate assignees exist in project
    const { rows: members } = await db.query(
      "SELECT member_id FROM project_members WHERE project_id = $1;",
      [task.projectId],
    );
    const memberIds = new Set(members.map((m) => m.member_id));
    const assignees = (finalAssigneeId || "")
      .split(",")
      .map((id: string) => id.trim())
      .filter(Boolean);
    for (const assignee of assignees) {
      if (!memberIds.has(assignee)) {
        await db.query(
          "INSERT INTO project_members (project_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;",
          [task.projectId, assignee],
        );
      }
    }

    let finalStartDate = (task.startDate || "").trim();
    let finalIsAuto = task.isStartDateAuto || false;

    // Auto-set start_date if status is 'todo' or 'in_progress' and start_date is empty
    if (!finalStartDate && ["todo", "in_progress"].includes(task.status)) {
      finalStartDate = getTodayIST();
      finalIsAuto = true;
    }

    const id = `t${Date.now()}`;
    const createdAt = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO tasks (id, title, description, status, priority, assignee_id, project_id, due_date, start_date, is_start_date_auto, created_at, updated_at, sprint_id, organization_id, attachments, parent_task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
         RETURNING *;`,
        [
          id,
          task.title,
          task.description || "",
          task.status,
          task.priority,
          finalAssigneeId,
          task.projectId,
          task.dueDate || "",
          finalStartDate,
          finalIsAuto,
          createdAt,
          createdAt,
          task.sprintId || null,
          organizationId || null,
          JSON.stringify(task.attachments || []),
          task.parentTaskId || null,
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
        start_date,
        is_start_date_auto,
        created_at,
        updated_at,
        sprint_id,
        attachments,
        parent_task_id,
        ...rest
      } = created;

      const parsedAssigneeIds = (assignee_id || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      return {
        ...rest,
        assigneeId: assignee_id || "",
        assigneeIds: parsedAssigneeIds,
        projectId: project_id,
        dueDate: due_date || "",
        startDate: start_date || "",
        isStartDateAuto: !!is_start_date_auto,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
        attachments: attachments || [],
        parentTaskId: parent_task_id || null,
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

    let finalAssigneeId =
      patch.assigneeId !== undefined
        ? patch.assigneeId
        : currentTask.assigneeId;

    if (Array.isArray(patch.assigneeIds)) {
      finalAssigneeId = patch.assigneeIds.map((s: string) => s.trim()).filter(Boolean).join(", ");
    }

    // Validate sprint assignment if updated
    if (patch.sprintId !== undefined && patch.sprintId !== null && patch.sprintId !== "") {
      const { rows: sprintRows } = await db.query(
        "SELECT id, project_id FROM sprints WHERE id = $1;",
        [patch.sprintId],
      );
      if (!sprintRows[0]) {
        const error: any = new Error(`Sprint with ID '${patch.sprintId}' not found.`);
        error.status = 400;
        throw error;
      }
      if (sprintRows[0].project_id !== finalProjectId) {
        const error: any = new Error(
          `Invalid sprint assignment: Sprint '${patch.sprintId}' belongs to project '${sprintRows[0].project_id}', not '${finalProjectId}'.`
        );
        error.status = 400;
        throw error;
      }
    }

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

      // Check status & start_date auto-assignment
      const nextStatus = patch.status !== undefined ? patch.status : currentTask.status;
      let nextStartDate = patch.startDate !== undefined ? patch.startDate.trim() : (currentTask.startDate || "");
      let nextIsAuto = patch.isStartDateAuto !== undefined ? patch.isStartDateAuto : (currentTask.isStartDateAuto || false);

      if (patch.startDate !== undefined) {
        if (patch.startDate.trim() !== (currentTask.startDate || "")) {
          if (patch.isStartDateAuto === undefined) {
            nextIsAuto = false;
          }
        }
      }

      if (!nextStartDate && ["todo", "in_progress"].includes(nextStatus)) {
        nextStartDate = getTodayIST();
        nextIsAuto = true;
      }

      if (patch.status !== undefined) {
        fieldsToUpdate.push(`status = $${index++}`);
        values.push(patch.status);
      }
      if (patch.priority !== undefined) {
        fieldsToUpdate.push(`priority = $${index++}`);
        values.push(patch.priority);
      }
      if (patch.assigneeId !== undefined || patch.assigneeIds !== undefined) {
        fieldsToUpdate.push(`assignee_id = $${index++}`);
        values.push(finalAssigneeId);
      }
      if (patch.projectId !== undefined) {
        fieldsToUpdate.push(`project_id = $${index++}`);
        values.push(patch.projectId);
      }
      if (patch.dueDate !== undefined) {
        fieldsToUpdate.push(`due_date = $${index++}`);
        values.push(patch.dueDate);
      }
      if (patch.startDate !== undefined || nextStartDate !== (currentTask.startDate || "")) {
        fieldsToUpdate.push(`start_date = $${index++}`);
        values.push(nextStartDate);
      }
      if (patch.isStartDateAuto !== undefined || nextIsAuto !== (currentTask.isStartDateAuto || false)) {
        fieldsToUpdate.push(`is_start_date_auto = $${index++}`);
        values.push(nextIsAuto);
      }
      if (patch.sprintId !== undefined) {
        fieldsToUpdate.push(`sprint_id = $${index++}`);
        values.push(patch.sprintId);
      }
      if (patch.attachments !== undefined) {
        fieldsToUpdate.push(`attachments = $${index++}::jsonb`);
        values.push(JSON.stringify(patch.attachments || []));
      }
      if (patch.parentTaskId !== undefined) {
        fieldsToUpdate.push(`parent_task_id = $${index++}`);
        values.push(patch.parentTaskId || null);
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
        attachments,
        parent_task_id,
        ...rest
      } = updated;

      const parsedAssigneeIds = (assignee_id || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      return {
        ...rest,
        assigneeId: assignee_id || "",
        assigneeIds: parsedAssigneeIds,
        projectId: project_id,
        dueDate: due_date,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
        attachments: attachments || [],
        parentTaskId: parent_task_id || null,
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

      // 1. Cascade delete subtasks recursively
      await client.query(
        "DELETE FROM tasks WHERE parent_task_id = $1;",
        [id],
      );

      // 2. Delete parent task
      const { rows } = await client.query(
        "DELETE FROM tasks WHERE id = $1 RETURNING *;",
        [id],
      );
      const deletedTask = rows[0];

      if (deletedTask) {
        // Prune attachments from Cloudflare R2 if any
        if (deletedTask.attachments && Array.isArray(deletedTask.attachments)) {
          for (const att of deletedTask.attachments) {
            if (att.url && (att.url.startsWith("http://") || att.url.startsWith("https://"))) {
              try {
                await deleteFromR2(att.url);
              } catch (r2Err) {
                console.warn(`[Task Deletion] Failed to delete attachment from R2: ${att.url}`, r2Err);
              }
            }
          }
        }

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
        attachments,
        parent_task_id,
        ...rest
      } = deletedTask;

      const parsedAssigneeIds = (assignee_id || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      return {
        ...rest,
        assigneeId: assignee_id || "",
        assigneeIds: parsedAssigneeIds,
        projectId: project_id,
        dueDate: due_date,
        createdAt: created_at,
        updatedAt: updated_at,
        sprintId: sprint_id,
        attachments: attachments || [],
        parentTaskId: parent_task_id || null,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
