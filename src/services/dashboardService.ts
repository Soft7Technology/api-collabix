import { db } from "../db/index.js";
import { ProjectService } from "./projectService.js";

export class DashboardService {
  static async getSprints(
    projectId?: string,
    organizationId?: string | null,
    userCtx?: any,
  ) {
    if (!organizationId) {
      return [];
    }
    let queryStr = "SELECT * FROM sprints";
    const params = [];
    const conditions = [];
    if (organizationId) {
      conditions.push(`organization_id = $${conditions.length + 1}`);
      params.push(organizationId);
    }
    if (projectId) {
      conditions.push(`project_id = $${conditions.length + 1}`);
      params.push(projectId);
    }
    if (userCtx && userCtx.roleRank >= 3) {
      const visibleProjects = await ProjectService.getAll(userCtx);
      const visibleProjectIds = visibleProjects.map((p) => p.id);
      if (visibleProjectIds.length === 0) {
        return [];
      }
      conditions.push(`project_id = ANY($${conditions.length + 1})`);
      params.push(visibleProjectIds);
    }
    if (conditions.length > 0) {
      queryStr += " WHERE " + conditions.join(" AND ");
    }
    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
    }));
  }

  static async getMeetings(organizationId?: string | null, userCtx?: any) {
    if (!organizationId) {
      return [];
    }
    let queryStr = `
      SELECT m.*, COALESCE(array_agg(ma.member_id) FILTER (WHERE ma.member_id IS NOT NULL), '{}') AS "attendees"
      FROM meetings m
      LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
    `;
    const params = [];
    const conditions = [];
    if (organizationId) {
      conditions.push(`m.organization_id = $${conditions.length + 1}`);
      params.push(organizationId);
    }
    if (userCtx && userCtx.roleRank >= 3) {
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM meeting_attendees ma2
          JOIN users u ON ma2.member_id = u.id
          WHERE ma2.meeting_id = m.id
            AND u.department_id = $${conditions.length + 1}
            AND (u.id = $${conditions.length + 2} OR u.id IN (
              SELECT member_id FROM project_members WHERE project_id IN (
                SELECT project_id FROM project_members WHERE member_id = $${conditions.length + 2}
              )
            ))
        )
      )`);
      params.push(userCtx.departmentId || null, userCtx.id);
    }
    if (conditions.length > 0) {
      queryStr += " WHERE " + conditions.join(" AND ");
    }
    queryStr += " GROUP BY m.id;";
    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      attendees: r.attendees,
    }));
  }

  static async getMeetingById(
    id: string,
    organizationId?: string | null,
    userCtx?: any,
  ) {
    if (!organizationId) {
      return null;
    }
    let queryStr = `
      SELECT m.*, COALESCE(array_agg(ma.member_id) FILTER (WHERE ma.member_id IS NOT NULL), '{}') AS "attendees"
      FROM meetings m
      LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
      WHERE m.id = $1
    `;
    const params: any[] = [id];
    if (organizationId) {
      queryStr += " AND m.organization_id = $2";
      params.push(organizationId);
    }
    if (userCtx && userCtx.roleRank >= 3) {
      queryStr += ` AND EXISTS (
        SELECT 1 FROM meeting_attendees ma2
        JOIN users u ON ma2.member_id = u.id
        WHERE ma2.meeting_id = m.id
          AND u.department_id = $${params.length + 1}
          AND (u.id = $${params.length + 2} OR u.id IN (
            SELECT member_id FROM project_members WHERE project_id IN (
              SELECT project_id FROM project_members WHERE member_id = $${params.length + 2}
            )
          ))
      )`;
      params.push(userCtx.departmentId || null, userCtx.id);
    }
    queryStr += " GROUP BY m.id;";
    const { rows } = await db.query(queryStr, params);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      title: r.title,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      attendees: r.attendees,
    };
  }

  static async getLeaves(
    memberId?: string,
    organizationId?: string | null,
    userCtx?: any,
  ) {
    let queryStr = "SELECT l.* FROM leaves l";
    const params = [];
    const conditions = [];
    if (organizationId) {
      conditions.push(`l.organization_id = $${conditions.length + 1}`);
      params.push(organizationId);
    } else if (userCtx && !userCtx.isSuperAdmin) {
      return [];
    }

    if (memberId) {
      conditions.push(`l.member_id = $${conditions.length + 1}`);
      params.push(memberId);
    }
    if (userCtx && userCtx.roleRank >= 3 && !userCtx.isSuperAdmin) {
      conditions.push(`EXISTS (
        SELECT 1 FROM users u
        WHERE l.member_id = u.id
          AND u.department_id = $${conditions.length + 1}
          AND (u.id = $${conditions.length + 2} OR u.id IN (
            SELECT member_id FROM project_members WHERE project_id IN (
              SELECT project_id FROM project_members WHERE member_id = $${conditions.length + 2}
            )
          ))
      )`);
      params.push(userCtx.departmentId || null, userCtx.id);
    }
    if (conditions.length > 0) {
      queryStr += " WHERE " + conditions.join(" AND ");
    }
    queryStr += " ORDER BY l.id DESC;";
    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      reason: r.reason,
    }));
  }

  static async getActivityItems(
    organizationId?: string | null,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    } | null,
  ) {
    if (!organizationId) {
      return [];
    }

    let queryStr = `
      SELECT a.* 
      FROM activity_items a 
      JOIN users u ON a.actor_id = u.id 
      WHERE u.organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (userCtx && userCtx.roleRank >= 3) {
      // Get projects they are member of
      const visibleProjects = await ProjectService.getAll(userCtx);
      const visibleProjectIds = visibleProjects.map((p) => p.id);

      queryStr += ` AND (a.project_id IS NULL OR a.project_id = ANY($2))`;
      params.push(visibleProjectIds);

      // Actor must be in same department and project
      queryStr += ` AND u.department_id = $3 AND (u.id = $4 OR u.id IN (
        SELECT member_id FROM project_members WHERE project_id = ANY($2)
      ))`;
      params.push(userCtx.departmentId || null, userCtx.id);
    }

    queryStr += ` ORDER BY a.id DESC LIMIT 50;`;

    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      target: r.target,
      timestamp: r.timestamp,
    }));
  }

  static async logActivity(
    actorId: string,
    action: string,
    target: string,
    projectId: string | null = null,
  ) {
    try {
      const id = `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const timestamp = new Date().toISOString();
      await db.query(
        "INSERT INTO activity_items (id, actor_id, action, target, timestamp, project_id) VALUES ($1, $2, $3, $4, $5, $6);",
        [id, actorId, action, target, timestamp, projectId],
      );
    } catch (error) {
      console.error("Failed to log activity:", error);
    }
  }
}
