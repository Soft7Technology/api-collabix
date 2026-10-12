import { db, pool } from "../db/index.js";
import { DashboardService } from "./dashboardService.js";
import { sanitizeContent, sanitizeAttachments } from "../utils/sanitize.js";

export interface DiscussionInput {
  projectId: string;
  type: "query" | "error" | "question";
  priority: "low" | "medium" | "high" | "urgent";
  title: string;
  description: string;
  assignedTo?: string;
  attachments?: Array<{ name: string; url: string; size?: number; type?: string }>;
}

export interface DiscussionReplyInput {
  discussionId: string;
  content: string;
  attachments?: Array<{ name: string; url: string; size?: number; type?: string }>;
}

export interface UserContext {
  id: string;
  roleName: string;
  roleRank: number;
  departmentId: string | null;
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

export class DiscussionService {
  /**
   * Helper: Verifies whether the user is authorized to access the project's discussions.
   */
  private static async verifyProjectAccess(
    projectId: string,
    organizationId?: string | null,
    userCtx?: UserContext,
  ): Promise<{ id: string; organization_id: string; name: string }> {
    const { rows } = await db.query(
      "SELECT id, organization_id, name FROM projects WHERE id = $1;",
      [projectId],
    );

    const project = rows[0];
    if (!project) {
      const error: any = new Error("Project not found.");
      error.status = 404;
      throw error;
    }

    if (organizationId && project.organization_id && project.organization_id !== organizationId && !userCtx?.isSuperAdmin) {
      const error: any = new Error("Forbidden: Project does not belong to your organization.");
      error.status = 403;
      throw error;
    }

    const isAdminOrManager =
      !userCtx ||
      userCtx.isSuperAdmin ||
      (userCtx.roleRank !== undefined && userCtx.roleRank <= 2) ||
      (userCtx.roleName &&
        ["admin", "super admin", "manager"].includes(userCtx.roleName.toLowerCase()));

    if (!isAdminOrManager && userCtx?.id) {
      const memberRes = await db.query(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND member_id = $2 LIMIT 1;",
        [projectId, userCtx.id],
      );
      if (memberRes.rows.length === 0) {
        const error: any = new Error("Forbidden: You do not have access to discussions in this project.");
        error.status = 403;
        throw error;
      }
    }

    return project;
  }

  static async getByProject(
    projectId: string,
    organizationId?: string | null,
    userCtx?: UserContext,
  ) {
    await this.verifyProjectAccess(projectId, organizationId, userCtx);

    const { rows } = await db.query(
      `SELECT d.id, d.project_id AS "projectId", d.organization_id AS "organizationId",
              d.user_id AS "userId", d.type, d.priority, d.title, d.description,
              d.assigned_to AS "assignedTo", d.status, d.resolved_at AS "resolvedAt",
              d.resolved_by AS "resolvedBy", d.attachments, d.created_at AS "createdAt",
              d.updated_at AS "updatedAt", u.name AS "userName", u.avatar_color AS "userAvatarColor",
              au.name AS "assignedToName",
              rb.name AS "resolvedByName",
              (SELECT COUNT(*)::int FROM discussion_replies r WHERE r.discussion_id = d.id) AS "replyCount"
       FROM project_discussions d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN users au ON au.id = d.assigned_to
       LEFT JOIN users rb ON rb.id = d.resolved_by
       WHERE d.project_id = $1 AND ($2::uuid IS NULL OR d.organization_id = $2::uuid)
       ORDER BY d.created_at DESC;`,
      [projectId, organizationId || null],
    );
    return rows;
  }

  static async create(
    userId: string,
    organizationId: string | null,
    input: DiscussionInput,
    userCtx?: UserContext,
  ) {
    await this.verifyProjectAccess(input.projectId, organizationId, userCtx);

    const cleanTitle = sanitizeContent(input.title);
    const cleanDescription = sanitizeContent(input.description);
    const cleanAssignedTo = sanitizeContent(input.assignedTo || "all");
    const cleanAttachments = sanitizeAttachments(input.attachments);
    const cleanType = (["query", "error", "question"].includes(input.type) ? input.type : "query") as "query" | "error" | "question";
    const cleanPriority = (["low", "medium", "high", "urgent"].includes(input.priority) ? input.priority : "medium") as "low" | "medium" | "high" | "urgent";

    if (!cleanTitle || !cleanDescription) {
      const error: any = new Error("Discussion title and description cannot be empty.");
      error.status = 400;
      throw error;
    }

    const { rows } = await db.query(
      `INSERT INTO project_discussions 
       (project_id, organization_id, user_id, type, priority, title, description, assigned_to, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, project_id AS "projectId", organization_id AS "organizationId",
                 user_id AS "userId", type, priority, title, description, assigned_to AS "assignedTo",
                 attachments, status, created_at AS "createdAt", updated_at AS "updatedAt";`,
      [
        input.projectId,
        organizationId,
        userId,
        cleanType,
        cleanPriority,
        cleanTitle,
        cleanDescription,
        cleanAssignedTo,
        JSON.stringify(cleanAttachments),
      ],
    );

    const discussion = rows[0];

    // Log Activity for Notifications
    try {
      const typeText = cleanType === "error" ? "error report" : cleanType === "question" ? "question" : "query";
      await DashboardService.logActivity(
        userId,
        `posted a ${typeText}: "${cleanTitle}"`,
        cleanTitle,
        input.projectId,
      );
    } catch (err) {
      console.error("Failed to log discussion activity notification:", err);
    }

    return discussion;
  }

  static async getReplies(
    discussionId: string,
    organizationId?: string | null,
    userCtx?: UserContext,
  ) {
    const discRes = await db.query(
      `SELECT id, project_id, organization_id FROM project_discussions WHERE id = $1;`,
      [discussionId],
    );
    const discussion = discRes.rows[0];
    if (!discussion) {
      const error: any = new Error("Discussion not found.");
      error.status = 404;
      throw error;
    }

    await this.verifyProjectAccess(discussion.project_id, organizationId, userCtx);

    const { rows } = await db.query(
      `SELECT r.id, r.discussion_id AS "discussionId", r.user_id AS "userId",
              r.content, r.attachments, r.created_at AS "createdAt",
              u.name AS "userName", u.avatar_color AS "userAvatarColor"
       FROM discussion_replies r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.discussion_id = $1
       ORDER BY r.created_at ASC;`,
      [discussionId],
    );
    return rows;
  }

  static async addReply(
    userId: string,
    input: DiscussionReplyInput,
    organizationId?: string | null,
    userCtx?: UserContext,
  ) {
    const discRes = await db.query(
      `SELECT id, title, project_id, organization_id FROM project_discussions WHERE id = $1;`,
      [input.discussionId],
    );
    const disc = discRes.rows[0];
    if (!disc) {
      const error: any = new Error("Discussion not found.");
      error.status = 404;
      throw error;
    }

    // Re-verify that the user has access to the discussion's parent project
    await this.verifyProjectAccess(disc.project_id, organizationId, userCtx);

    const cleanContent = sanitizeContent(input.content);
    const cleanAttachments = sanitizeAttachments(input.attachments);

    if (!cleanContent) {
      const error: any = new Error("Reply content cannot be empty.");
      error.status = 400;
      throw error;
    }

    const { rows } = await db.query(
      `INSERT INTO discussion_replies (discussion_id, user_id, content, attachments)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, discussion_id AS "discussionId", user_id AS "userId",
                 content, attachments, created_at AS "createdAt";`,
      [
        input.discussionId,
        userId,
        cleanContent,
        JSON.stringify(cleanAttachments),
      ],
    );

    // Log Activity for Notifications
    try {
      await DashboardService.logActivity(
        userId,
        `replied to discussion: "${disc.title}"`,
        disc.title,
        disc.project_id,
      );
    } catch (err) {
      console.error("Failed to log reply notification:", err);
    }

    const reply = rows[0];
    const userRes = await db.query(`SELECT name, avatar_color FROM users WHERE id = $1;`, [userId]);
    if (userRes.rows.length > 0) {
      reply.userName = userRes.rows[0].name;
      reply.userAvatarColor = userRes.rows[0].avatar_color;
    }

    return reply;
  }

  static async toggleResolve(
    id: string,
    userId: string,
    organizationId?: string | null,
    userCtx?: UserContext,
  ) {
    const discRes = await db.query(
      `SELECT id, status, title, project_id, organization_id FROM project_discussions WHERE id = $1;`,
      [id],
    );
    const disc = discRes.rows[0];
    if (!disc) return null;

    await this.verifyProjectAccess(disc.project_id, organizationId, userCtx);

    const currentStatus = disc.status;
    const newStatus = currentStatus === "resolved" ? "open" : "resolved";
    const resolvedAt = newStatus === "resolved" ? new Date().toISOString() : null;
    const resolvedBy = newStatus === "resolved" ? userId : null;

    const { rows } = await db.query(
      `UPDATE project_discussions
       SET status = $1, resolved_at = $2, resolved_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, status, resolved_at AS "resolvedAt", resolved_by AS "resolvedBy";`,
      [newStatus, resolvedAt, resolvedBy, id],
    );

    try {
      const actionText = newStatus === "resolved" ? "resolved discussion" : "reopened discussion";
      await DashboardService.logActivity(
        userId,
        `${actionText}: "${disc.title}"`,
        disc.title,
        disc.project_id,
      );
    } catch (err) {
      console.error("Failed to log resolve notification:", err);
    }

    return rows[0];
  }

  static async delete(
    id: string,
    userId: string,
    isSuperAdmin: boolean,
    organizationId?: string | null,
    userCtx?: UserContext,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      const discRes = await client.query(
        "SELECT id, project_id, organization_id, user_id FROM project_discussions WHERE id = $1;",
        [id],
      );
      const disc = discRes.rows[0];
      if (!disc) {
        await client.query("ROLLBACK;");
        return false;
      }

      if (organizationId && disc.organization_id && disc.organization_id !== organizationId && !isSuperAdmin) {
        await client.query("ROLLBACK;");
        const error: any = new Error("Forbidden: Discussion does not belong to your organization.");
        error.status = 403;
        throw error;
      }

      const isAuthor = disc.user_id === userId;
      const isAdminOrManager =
        isSuperAdmin ||
        (userCtx?.roleRank !== undefined && userCtx.roleRank <= 2) ||
        (userCtx?.roleName && ["admin", "super admin", "manager"].includes(userCtx.roleName.toLowerCase()));

      if (!isAuthor && !isAdminOrManager) {
        await client.query("ROLLBACK;");
        const error: any = new Error("Forbidden: You can only delete your own discussions.");
        error.status = 403;
        throw error;
      }

      // Explicitly delete replies first to prevent orphan reply records across DB migration versions
      await client.query("DELETE FROM discussion_replies WHERE discussion_id = $1;", [id]);

      // Delete parent discussion
      const { rowCount } = await client.query(
        "DELETE FROM project_discussions WHERE id = $1;",
        [id],
      );

      await client.query("COMMIT;");
      return (rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }
}
