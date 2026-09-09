import { db, pool } from "../db/index.js";

export interface CreateMeetingInput {
  title: string;
  projectId?: string | null;
  platform?: string;
  meetingLink?: string;
  meetingCode?: string;
  passcode?: string;
  hostId?: string;
  teamDepartment?: string;
  description?: string;
  agenda?: string[];
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  timezone?: string;
  status?: "upcoming" | "live" | "completed" | "cancelled";
  recordingUrl?: string;
  notes?: string;
  attendees?: string[];
}

export interface UpdateMeetingInput {
  title?: string;
  projectId?: string | null;
  platform?: string;
  meetingLink?: string;
  meetingCode?: string;
  passcode?: string;
  hostId?: string;
  teamDepartment?: string;
  description?: string;
  agenda?: string[];
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  timezone?: string;
  status?: "upcoming" | "live" | "completed" | "cancelled";
  recordingUrl?: string;
  notes?: string;
  attendees?: string[];
}

export interface MeetingFilters {
  tab?: "upcoming" | "past";
  team?: string;
  status?: string;
  search?: string;
  date?: string;
  organizationId?: string | null;
  userCtx?: any;
}

export class MeetingService {
  /**
   * Helper to format duration string (e.g., "30 min", "1 hr", "1 hr 30 min", "On-demand")
   */
  private static formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return "On-demand";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
    return `${hours} hr ${remainingMins} min`;
  }

  /**
   * Helper to format date display (e.g., "Everyday · Available Anytime", "Today · 12:00 PM – 12:30 PM")
   */
  private static formatDateDisplay(dateStr: string, startTime: string, endTime: string): string {
    try {
      if (!dateStr || dateStr.toLowerCase() === "everyday" || dateStr.toLowerCase() === "daily" || dateStr.toLowerCase() === "anytime") {
        return "Everyday · Available Anytime";
      }

      if (startTime?.toLowerCase() === "anytime") {
        return `${dateStr} · Available Anytime`;
      }

      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      let prefix = "";
      if (dateStr === today) {
        prefix = "Today";
      } else if (dateStr === tomorrow) {
        prefix = "Tomorrow";
      } else if (dateStr === yesterday) {
        prefix = "Yesterday";
      } else {
        const d = new Date(dateStr + "T00:00:00");
        prefix = d.toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
      }

      return `${prefix} · ${startTime || ""} – ${endTime || ""}`.trim();
    } catch {
      return `${dateStr} · ${startTime || ""} – ${endTime || ""}`.trim();
    }
  }

  /**
   * Format raw meeting SQL row into rich frontend-compatible Meeting object
   */
  private static formatMeetingRow(row: any) {
    const agenda = Array.isArray(row.agenda)
      ? row.agenda
      : typeof row.agenda === "string"
      ? JSON.parse(row.agenda || "[]")
      : [];

    const durationMins = row.duration_minutes || 30;

    return {
      id: row.id,
      title: row.title,
      projectId: row.project_id || null,
      projectName: row.project_name || null,
      platform: row.platform || "teams",
      meetingLink:
        row.meeting_link ||
        `https://teams.microsoft.com/l/meetup-join/collabix-${row.id}`,
      meetingCode: row.meeting_code || "",
      passcode: row.passcode || "",
      team: row.team_department || "General",
      teamDepartment: row.team_department || "General",
      description: row.description || "",
      agenda,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      dateDisplay: MeetingService.formatDateDisplay(row.date, row.start_time, row.end_time),
      duration: MeetingService.formatDuration(durationMins),
      durationMinutes: durationMins,
      timezone: row.timezone || "Asia/Kolkata",
      status: row.status || "upcoming",
      recordingUrl: row.recording_url || "",
      notes: row.notes || "",
      organizationId: row.organization_id,
      organizer: {
        id: row.host_id || "system",
        name: row.host_name || "Organizer",
        email: row.host_email || "",
        avatarColor: row.host_avatar_color || "#7C3AED",
        initials: row.host_initials || (row.host_name ? row.host_name.slice(0, 2).toUpperCase() : "OR"),
      },
      participants: (row.attendees_json || []).map((att: any) => ({
        id: att.id,
        name: att.name,
        email: att.email || "",
        avatarColor: att.avatar_color || "#7C3AED",
        initials: att.initials || (att.name ? att.name.slice(0, 2).toUpperCase() : "TM"),
        role: att.role || "attendee",
        status: att.status || "invited",
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all meetings filtered by organization, tab, team, status, search
   */
  static async getAll(filters: MeetingFilters = {}) {
    const { tab, team, status, search, date, organizationId } = filters;

    let queryStr = `
      SELECT 
        m.*,
        p_meet.name AS project_name,
        u.name AS host_name,
        u.email AS host_email,
        u.avatar_color AS host_avatar_color,
        u.initials AS host_initials,
        COALESCE(
          json_agg(
            json_build_object(
              'id', att_u.id,
              'name', att_u.name,
              'email', att_u.email,
              'avatar_color', att_u.avatar_color,
              'initials', att_u.initials,
              'role', ma.role,
              'status', ma.status
            )
          ) FILTER (WHERE att_u.id IS NOT NULL),
          '[]'::json
        ) AS attendees_json
      FROM meetings m
      LEFT JOIN projects p_meet ON m.project_id = p_meet.id
      LEFT JOIN users u ON m.host_id = u.id
      LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
      LEFT JOIN users att_u ON ma.member_id = att_u.id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (organizationId) {
      params.push(organizationId);
      conditions.push(`m.organization_id = $${params.length}`);
    }

    // Tab filtering: upcoming vs past
    if (tab === "upcoming") {
      conditions.push(`(m.status IN ('upcoming', 'live') OR m.date ILIKE '%everyday%' OR m.date ILIKE '%daily%' OR m.date ILIKE '%anytime%' OR (m.status != 'cancelled' AND m.date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::text))`);
    } else if (tab === "past") {
      conditions.push(`(m.date NOT ILIKE '%everyday%' AND m.date NOT ILIKE '%daily%' AND m.date NOT ILIKE '%anytime%' AND (m.status IN ('completed', 'cancelled') OR m.date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date::text))`);
    }

    // Status filtering
    if (status && status !== "all") {
      params.push(status);
      conditions.push(`m.status = $${params.length}`);
    }

    // Team department filtering
    if (team && team !== "all") {
      params.push(`%${team}%`);
      conditions.push(`m.team_department ILIKE $${params.length}`);
    }

    // Date filtering
    if (date && date !== "all") {
      params.push(date);
      conditions.push(`m.date = $${params.length}`);
    }

    // Search query
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(m.title ILIKE $${params.length} OR m.description ILIKE $${params.length} OR m.team_department ILIKE $${params.length})`);
    }

    // Participant & Host access control:
    // If not super admin / admin (roleRank <= 1), user can only see meetings they host or are invited to
    if (filters.userCtx && !filters.userCtx.isSuperAdmin && (filters.userCtx.roleRank ?? 4) > 1) {
      params.push(filters.userCtx.id);
      conditions.push(`(
        m.host_id = $${params.length}
        OR EXISTS (
          SELECT 1 FROM meeting_attendees ma_filter
          WHERE ma_filter.meeting_id = m.id AND ma_filter.member_id = $${params.length}
        )
      )`);
    }

    if (conditions.length > 0) {
      queryStr += " WHERE " + conditions.join(" AND ");
    }

    queryStr += `
      GROUP BY m.id, u.id, p_meet.id
      ORDER BY 
        CASE WHEN m.status = 'live' THEN 0 WHEN m.status = 'upcoming' THEN 1 ELSE 2 END,
        m.date ASC,
        m.start_time ASC;
    `;

    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => MeetingService.formatMeetingRow(r));
  }

  /**
   * Get single meeting by ID
   */
  static async getById(
    id: string,
    organizationId?: string | null,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    }
  ) {
    let queryStr = `
      SELECT 
        m.*,
        p_meet.name AS project_name,
        u.name AS host_name,
        u.email AS host_email,
        u.avatar_color AS host_avatar_color,
        u.initials AS host_initials,
        COALESCE(
          json_agg(
            json_build_object(
              'id', att_u.id,
              'name', att_u.name,
              'email', att_u.email,
              'avatar_color', att_u.avatar_color,
              'initials', att_u.initials,
              'role', ma.role,
              'status', ma.status
            )
          ) FILTER (WHERE att_u.id IS NOT NULL),
          '[]'::json
        ) AS attendees_json
      FROM meetings m
      LEFT JOIN projects p_meet ON m.project_id = p_meet.id
      LEFT JOIN users u ON m.host_id = u.id
      LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
      LEFT JOIN users att_u ON ma.member_id = att_u.id
      WHERE m.id = $1
    `;
    const params: any[] = [id];

    if (organizationId) {
      params.push(organizationId);
      queryStr += ` AND m.organization_id = $${params.length}`;
    }

    if (userCtx && !userCtx.isSuperAdmin && (userCtx.roleRank ?? 4) > 1) {
      params.push(userCtx.id);
      queryStr += ` AND (
        m.host_id = $${params.length}
        OR EXISTS (
          SELECT 1 FROM meeting_attendees ma_auth
          WHERE ma_auth.meeting_id = m.id AND ma_auth.member_id = $${params.length}
        )
      )`;
    }

    queryStr += ` GROUP BY m.id, u.id, p_meet.id;`;

    const { rows } = await db.query(queryStr, params);
    if (!rows[0]) return null;
    return MeetingService.formatMeetingRow(rows[0]);
  }

  /**
   * Create a new meeting
   */
  static async create(meeting: CreateMeetingInput, organizationId?: string | null, hostUser?: any) {
    const id = `meet-${Date.now()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      const platform = meeting.platform || "teams";
      const meetingLink =
        meeting.meetingLink?.trim() ||
        (platform === "teams"
          ? `https://teams.microsoft.com/l/meetup-join/collabix-${meeting.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${id.slice(-4)}`
          : "");

      const hostId = meeting.hostId || hostUser?.id || null;
      const agendaJson = JSON.stringify(meeting.agenda || []);
      const durationMinutes = meeting.durationMinutes || 30;

      const { rows } = await client.query(
        `INSERT INTO meetings (
          id, title, project_id, platform, meeting_link, meeting_code, passcode,
          host_id, team_department, description, agenda, date,
          start_time, end_time, duration_minutes, timezone, status,
          recording_url, notes, organization_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20, NOW(), NOW()
        ) RETURNING *;`,
        [
          id,
          meeting.title,
          meeting.projectId || null,
          platform,
          meetingLink,
          meeting.meetingCode || "",
          meeting.passcode || "",
          hostId,
          meeting.teamDepartment || "Development Team",
          meeting.description || "",
          agendaJson,
          meeting.date,
          meeting.startTime,
          meeting.endTime,
          durationMinutes,
          meeting.timezone || "Asia/Kolkata",
          meeting.status || "upcoming",
          meeting.recordingUrl || "",
          meeting.notes || "",
          organizationId || null,
        ],
      );

      const created = rows[0];

      // Add Host as attendee if not already in list
      const attendeeSet = new Set(meeting.attendees || []);
      if (hostId) attendeeSet.add(hostId);

      for (const memberId of attendeeSet) {
        const role = memberId === hostId ? "host" : "attendee";
        await client.query(
          `INSERT INTO meeting_attendees (meeting_id, member_id, role, status)
           VALUES ($1, $2, $3, 'invited')
           ON CONFLICT (meeting_id, member_id) DO NOTHING;`,
          [id, memberId, role],
        );
      }

      await client.query("COMMIT;");
      return await MeetingService.getById(created.id, organizationId);
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing meeting
   */
  static async update(
    id: string,
    patch: UpdateMeetingInput,
    organizationId?: string | null,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    }
  ) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      let checkQuery = "SELECT id, host_id FROM meetings WHERE id = $1 AND organization_id = $2";
      const checkParams: any[] = [id, organizationId];

      if (userCtx && !userCtx.isSuperAdmin && (userCtx.roleRank ?? 4) > 1) {
        checkParams.push(userCtx.id);
        checkQuery += ` AND (host_id = $3 OR EXISTS (SELECT 1 FROM meeting_attendees WHERE meeting_id = $1 AND member_id = $3))`;
      }
      checkQuery += ";";

      const { rows: checkRows } = await client.query(checkQuery, checkParams);
      if (!checkRows[0]) {
        await client.query("ROLLBACK;");
        return null;
      }

      const fieldsToUpdate: string[] = [];
      const values: any[] = [];
      let index = 1;

      if (patch.title !== undefined) {
        fieldsToUpdate.push(`title = $${index++}`);
        values.push(patch.title);
      }
      if (patch.projectId !== undefined) {
        fieldsToUpdate.push(`project_id = $${index++}`);
        values.push(patch.projectId || null);
      }
      if (patch.platform !== undefined) {
        fieldsToUpdate.push(`platform = $${index++}`);
        values.push(patch.platform);
      }
      if (patch.meetingLink !== undefined) {
        fieldsToUpdate.push(`meeting_link = $${index++}`);
        values.push(patch.meetingLink);
      }
      if (patch.meetingCode !== undefined) {
        fieldsToUpdate.push(`meeting_code = $${index++}`);
        values.push(patch.meetingCode);
      }
      if (patch.passcode !== undefined) {
        fieldsToUpdate.push(`passcode = $${index++}`);
        values.push(patch.passcode);
      }
      if (patch.hostId !== undefined) {
        fieldsToUpdate.push(`host_id = $${index++}`);
        values.push(patch.hostId);
      }
      if (patch.teamDepartment !== undefined) {
        fieldsToUpdate.push(`team_department = $${index++}`);
        values.push(patch.teamDepartment);
      }
      if (patch.description !== undefined) {
        fieldsToUpdate.push(`description = $${index++}`);
        values.push(patch.description);
      }
      if (patch.agenda !== undefined) {
        fieldsToUpdate.push(`agenda = $${index++}`);
        values.push(JSON.stringify(patch.agenda));
      }
      if (patch.date !== undefined) {
        fieldsToUpdate.push(`date = $${index++}`);
        values.push(patch.date);
      }
      if (patch.startTime !== undefined) {
        fieldsToUpdate.push(`start_time = $${index++}`);
        values.push(patch.startTime);
      }
      if (patch.endTime !== undefined) {
        fieldsToUpdate.push(`end_time = $${index++}`);
        values.push(patch.endTime);
      }
      if (patch.durationMinutes !== undefined) {
        fieldsToUpdate.push(`duration_minutes = $${index++}`);
        values.push(patch.durationMinutes);
      }
      if (patch.timezone !== undefined) {
        fieldsToUpdate.push(`timezone = $${index++}`);
        values.push(patch.timezone);
      }
      if (patch.status !== undefined) {
        fieldsToUpdate.push(`status = $${index++}`);
        values.push(patch.status);
      }
      if (patch.recordingUrl !== undefined) {
        fieldsToUpdate.push(`recording_url = $${index++}`);
        values.push(patch.recordingUrl);
      }
      if (patch.notes !== undefined) {
        fieldsToUpdate.push(`notes = $${index++}`);
        values.push(patch.notes);
      }

      fieldsToUpdate.push(`updated_at = NOW()`);

      if (fieldsToUpdate.length > 0) {
        values.push(id, organizationId);
        const query = `UPDATE meetings SET ${fieldsToUpdate.join(", ")} WHERE id = $${index} AND organization_id = $${index + 1} RETURNING *;`;
        await client.query(query, values);
      }

      if (patch.attendees !== undefined) {
        await client.query(
          "DELETE FROM meeting_attendees WHERE meeting_id = $1;",
          [id],
        );
        for (const memberId of patch.attendees) {
          await client.query(
            `INSERT INTO meeting_attendees (meeting_id, member_id, role, status)
             VALUES ($1, $2, 'attendee', 'invited')
             ON CONFLICT (meeting_id, member_id) DO NOTHING;`,
            [id, memberId],
          );
        }
      }

      await client.query("COMMIT;");
      return await MeetingService.getById(id, organizationId);
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete or Cancel a meeting
   */
  static async delete(
    id: string,
    organizationId?: string | null,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    }
  ) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      let checkQuery = "SELECT id, host_id FROM meetings WHERE id = $1 AND organization_id = $2";
      const checkParams: any[] = [id, organizationId];

      if (userCtx && !userCtx.isSuperAdmin && (userCtx.roleRank ?? 4) > 1) {
        checkParams.push(userCtx.id);
        checkQuery += " AND host_id = $3";
      }
      checkQuery += ";";

      const { rows: checkRows } = await client.query(checkQuery, checkParams);
      if (!checkRows[0]) {
        await client.query("ROLLBACK;");
        return null;
      }

      const existing = await MeetingService.getById(id, organizationId);

      await client.query(
        "DELETE FROM meetings WHERE id = $1 AND organization_id = $2;",
        [id, organizationId],
      );

      await client.query("COMMIT;");
      return existing;
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }
}
