import { db } from "../db/index.js";
import { DashboardService } from "./dashboardService.js";

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

export class DiscussionService {
  static async getByProject(projectId: string, organizationId?: string | null) {
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

  static async create(userId: string, organizationId: string | null, input: DiscussionInput) {
    const assignedTo = input.assignedTo || "all";

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
        input.type || "query",
        input.priority || "medium",
        input.title,
        input.description,
        assignedTo,
        JSON.stringify(input.attachments || []),
      ],
    );

    const discussion = rows[0];

    // Log Activity for Notifications
    try {
      const typeText = input.type === "error" ? "error report" : input.type === "question" ? "question" : "query";
      await DashboardService.logActivity(
        userId,
        `posted a ${typeText}: "${input.title}"`,
        input.title,
        input.projectId,
      );
    } catch (err) {
      console.error("Failed to log discussion activity notification:", err);
    }

    return discussion;
  }

  static async getReplies(discussionId: string) {
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

  static async addReply(userId: string, input: DiscussionReplyInput) {
    const { rows } = await db.query(
      `INSERT INTO discussion_replies (discussion_id, user_id, content, attachments)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, discussion_id AS "discussionId", user_id AS "userId",
                 content, attachments, created_at AS "createdAt";`,
      [
        input.discussionId,
        userId,
        input.content,
        JSON.stringify(input.attachments || []),
      ],
    );

    // Fetch discussion details to log notification
    const discRes = await db.query(`SELECT title, project_id FROM project_discussions WHERE id = $1;`, [input.discussionId]);
    if (discRes.rows.length > 0) {
      const disc = discRes.rows[0];
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
    }

    const reply = rows[0];
    const userRes = await db.query(`SELECT name, avatar_color FROM users WHERE id = $1;`, [userId]);
    if (userRes.rows.length > 0) {
      reply.userName = userRes.rows[0].name;
      reply.userAvatarColor = userRes.rows[0].avatar_color;
    }

    return reply;
  }

  static async toggleResolve(id: string, userId: string) {
    const discRes = await db.query(`SELECT status, title, project_id FROM project_discussions WHERE id = $1;`, [id]);
    if (discRes.rows.length === 0) return null;

    const currentStatus = discRes.rows[0].status;
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
        `${actionText}: "${discRes.rows[0].title}"`,
        discRes.rows[0].title,
        discRes.rows[0].project_id,
      );
    } catch (err) {
      console.error("Failed to log resolve notification:", err);
    }

    return rows[0];
  }

  static async delete(id: string, userId: string, isSuperAdmin: boolean) {
    const { rowCount } = await db.query(
      `DELETE FROM project_discussions WHERE id = $1 AND ($2 = TRUE OR user_id = $3);`,
      [id, isSuperAdmin, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
