import { db } from "../db/index.js";

export interface DiscussionInput {
  projectId: string;
  type: "query" | "error" | "question";
  priority: "low" | "medium" | "high" | "urgent";
  title: string;
  description: string;
  attachments?: Array<{ name: string; url: string; size?: number; type?: string }>;
}

export class DiscussionService {
  static async getByProject(projectId: string, organizationId?: string | null) {
    const { rows } = await db.query(
      `SELECT d.id, d.project_id AS "projectId", d.organization_id AS "organizationId",
              d.user_id AS "userId", d.type, d.priority, d.title, d.description,
              d.attachments, d.status, d.created_at AS "createdAt", d.updated_at AS "updatedAt",
              u.name AS "userName", u.avatar_color AS "userAvatarColor"
       FROM project_discussions d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.project_id = $1 AND ($2::uuid IS NULL OR d.organization_id = $2::uuid)
       ORDER BY d.created_at DESC;`,
      [projectId, organizationId || null],
    );
    return rows;
  }

  static async create(userId: string, organizationId: string | null, input: DiscussionInput) {
    const { rows } = await db.query(
      `INSERT INTO project_discussions 
       (project_id, organization_id, user_id, type, priority, title, description, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, project_id AS "projectId", organization_id AS "organizationId",
                 user_id AS "userId", type, priority, title, description,
                 attachments, status, created_at AS "createdAt", updated_at AS "updatedAt";`,
      [
        input.projectId,
        organizationId,
        userId,
        input.type || "query",
        input.priority || "medium",
        input.title,
        input.description,
        JSON.stringify(input.attachments || []),
      ],
    );
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
