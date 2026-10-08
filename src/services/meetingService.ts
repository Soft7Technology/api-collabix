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

export interface MeetingUserContext {
  id: string;
  roleName?: string;
  roleRank?: number;
  departmentId?: string | null;
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

export interface MeetingFilters {
  tab?: "upcoming" | "past";
  team?: string;
  status?: string;
  search?: string;
  date?: string;
  organizationId?: string | null;
  userCtx?: MeetingUserContext;
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
  private static formatMeetingRow(row: any, userCtx?: any) {
    const agenda = Array.isArray(row.agenda)
      ? row.agenda
      : typeof row.agenda === "string"
      ? JSON.parse(row.agenda || "[]")
      : [];

    const durationMins = row.duration_minutes || 30;

    const attendees = row.attendees_json || [];
    const isHost = userCtx?.id && row.host_id === userCtx.id;
    const isAttendee = userCtx?.id && attendees.some((att: any) => att.id === userCtx.id);
    const isSuperAdmin = userCtx?.isSuperAdmin || userCtx?.is_super_admin;
    const roleRank = userCtx?.roleRank ?? userCtx?.role_rank ?? 4;
    const roleName = (userCtx?.roleName || userCtx?.role_name || "").toLowerCase();
    const isAdmin = isSuperAdmin || roleRank <= 1 || roleName === "admin" || roleName === "super admin";

    // Passcode security: Only Host, Invited Attendees, or Workspace Admins can view the plaintext passcode
    const canViewPasscode = isHost || isAttendee || isAdmin;
    const hasPasscode = Boolean(row.passcode && row.passcode.trim().length > 0);
    const visiblePasscode = canViewPasscode ? (row.passcode || "") : (hasPasscode ? "••••••" : "");

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
      passcode: visiblePasscode,
      hasPasscode,
      isHost: Boolean(isHost),
      isAttendee: Boolean(isAttendee),
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
    return rows.map((r) => MeetingService.formatMeetingRow(r, filters.userCtx));
  }

  /**
   * Get single meeting by ID
   */
  static async getById(
    id: string,
    organizationId?: string | null,
    userCtx?: MeetingUserContext
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
    return MeetingService.formatMeetingRow(rows[0], userCtx);
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
      const hostCtx = hostUser
        ? {
            id: hostUser.id,
            roleRank: hostUser.role_rank ?? (hostUser.is_super_admin ? 0 : 4),
            isSuperAdmin: hostUser.is_super_admin || false,
          }
        : hostId
        ? { id: hostId, roleRank: 4 }
        : undefined;

      return await MeetingService.getById(created.id, organizationId, hostCtx);
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find existing active live instant meeting for a host created recently (prevents unbound duplicate room creation)
   */
  static async findActiveInstantMeeting(hostId: string, organizationId?: string | null) {
    if (!hostId) return null;
    let queryStr = `
      SELECT m.*,
        u.name as host_name,
        u.email as host_email,
        u.avatar_color as host_avatar_color,
        u.initials as host_initials,
        p.name as project_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', att_u.id,
              'name', att_u.name,
              'email', att_u.email,
              'avatarColor', att_u.avatar_color,
              'initials', att_u.initials,
              'role', ma.role,
              'status', ma.status
            )
          ) FILTER (WHERE att_u.id IS NOT NULL),
          '[]'::json
        ) as attendees_json
      FROM meetings m
      LEFT JOIN users u ON m.host_id = u.id
      LEFT JOIN projects p ON m.project_id = p.id
      LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
      LEFT JOIN users att_u ON ma.member_id = att_u.id
      WHERE m.host_id = $1
        AND m.status = 'live'
        AND m.created_at >= NOW() - INTERVAL '45 minutes'
    `;
    const params: any[] = [hostId];
    if (organizationId) {
      queryStr += " AND (m.organization_id = $2 OR m.organization_id IS NULL)";
      params.push(organizationId);
    }
    queryStr += " GROUP BY m.id, u.id, p.id ORDER BY m.created_at DESC LIMIT 1;";

    const { rows } = await db.query(queryStr, params);
    if (!rows[0]) return null;
    return MeetingService.formatMeetingRow(rows[0], { id: hostId, roleRank: 4 });
  }

  /**
   * Auto-cleanup stale instant/live meetings older than 2 hours
   */
  static async cleanupStaleInstantMeetings(organizationId?: string | null) {
    try {
      let queryStr = `
        UPDATE meetings 
        SET status = 'completed', updated_at = NOW()
        WHERE status = 'live'
          AND created_at < NOW() - INTERVAL '2 hours'
      `;
      const params: any[] = [];
      if (organizationId) {
        queryStr += " AND (organization_id = $1 OR organization_id IS NULL)";
        params.push(organizationId);
      }
      await db.query(queryStr, params);
    } catch (err) {
      console.error("Cleanup stale instant meetings error:", err);
    }
  }

  /**
   * Verify meeting passcode securely
   */
  static async verifyPasscode(id: string, passcode: string, organizationId?: string | null) {
    if (!id || typeof passcode !== "string") {
      return { valid: false, message: "Meeting ID and passcode are required" };
    }
    let queryStr = "SELECT id, passcode, meeting_link, platform FROM meetings WHERE id = $1";
    const params: any[] = [id];
    if (organizationId) {
      queryStr += " AND (organization_id = $2 OR organization_id IS NULL)";
      params.push(organizationId);
    }
    queryStr += ";";

    const { rows } = await db.query(queryStr, params);
    if (!rows[0]) {
      return { valid: false, message: "Meeting not found" };
    }

    const actualPasscode = (rows[0].passcode || "").trim();
    const inputPasscode = (passcode || "").trim();

    if (actualPasscode === "" || actualPasscode === inputPasscode) {
      return {
        valid: true,
        meetingLink:
          rows[0].meeting_link ||
          `https://teams.microsoft.com/l/meetup-join/collabix-${rows[0].id}`,
        platform: rows[0].platform || "teams",
      };
    }

    return { valid: false, message: "Invalid passcode" };
  }

  /**
   * Update an existing meeting with strict Host / Admin authorization checks
   */
  static async update(
    id: string,
    patch: UpdateMeetingInput,
    organizationId?: string | null,
    userCtx?: MeetingUserContext
  ) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Fetch meeting record to check existence and ownership
      const { rows: existingRows } = await client.query(
        "SELECT id, host_id FROM meetings WHERE id = $1 AND organization_id = $2;",
        [id, organizationId]
      );
      if (!existingRows[0]) {
        await client.query("ROLLBACK;");
        return null;
      }

      const meetingHostId = existingRows[0].host_id;

      // 2. Authorization Checks (BAC)
      if (userCtx) {
        const isHost = userCtx.id && meetingHostId === userCtx.id;
        const roleRank = userCtx.roleRank ?? 4;
        const roleName = (userCtx.roleName || "").toLowerCase();
        const isAdmin = Boolean(
          userCtx.isSuperAdmin ||
          roleRank <= 2 ||
          roleName === "admin" ||
          roleName === "super admin" ||
          roleName === "manager"
        );

        if (!isHost && !isAdmin) {
          // Check if user is an invited attendee
          const { rows: attRows } = await client.query(
            "SELECT 1 FROM meeting_attendees WHERE meeting_id = $1 AND member_id = $2;",
            [id, userCtx.id]
          );
          const isAttendee = Boolean(attRows[0]);

          if (!isAttendee) {
            await client.query("ROLLBACK;");
            const err: any = new Error("Forbidden: You are not authorized to modify this meeting.");
            err.status = 403;
            throw err;
          }

          // Attendees can only update notes / recordingUrl
          const coreFieldsChanged = [
            patch.title,
            patch.projectId,
            patch.platform,
            patch.meetingLink,
            patch.meetingCode,
            patch.passcode,
            patch.hostId,
            patch.teamDepartment,
            patch.description,
            patch.agenda,
            patch.date,
            patch.startTime,
            patch.endTime,
            patch.durationMinutes,
            patch.timezone,
            patch.status,
            patch.attendees,
          ].some((val) => val !== undefined);

          if (coreFieldsChanged) {
            await client.query("ROLLBACK;");
            const err: any = new Error(
              "Forbidden: Only the meeting host or organization administrators can modify core meeting details. Attendees may only update meeting notes."
            );
            err.status = 403;
            throw err;
          }
        }
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
      return await MeetingService.getById(id, organizationId, userCtx);
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete or Cancel a meeting with strict Host / Admin authorization checks
   */
  static async delete(
    id: string,
    organizationId?: string | null,
    userCtx?: MeetingUserContext
  ) {
    if (!organizationId) return null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Fetch meeting record to check existence and ownership
      const { rows: existingRows } = await client.query(
        "SELECT id, host_id FROM meetings WHERE id = $1 AND organization_id = $2;",
        [id, organizationId]
      );
      if (!existingRows[0]) {
        await client.query("ROLLBACK;");
        return null;
      }

      const meetingHostId = existingRows[0].host_id;

      // 2. Authorization Checks (BAC): Only Host or Admin/Manager can cancel/delete
      if (userCtx) {
        const isHost = userCtx.id && meetingHostId === userCtx.id;
        const roleRank = userCtx.roleRank ?? 4;
        const roleName = (userCtx.roleName || "").toLowerCase();
        const isAdmin = Boolean(
          userCtx.isSuperAdmin ||
          roleRank <= 2 ||
          roleName === "admin" ||
          roleName === "super admin" ||
          roleName === "manager"
        );

        if (!isHost && !isAdmin) {
          await client.query("ROLLBACK;");
          const err: any = new Error("Forbidden: Only the meeting host or organization administrators can cancel or delete this meeting.");
          err.status = 403;
          throw err;
        }
      }

      const existing = await MeetingService.getById(id, organizationId, userCtx);

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

  static async getMeetingMessages(meetingId: string, organizationId?: string | null) {
    let query = "SELECT * FROM meeting_messages WHERE meeting_id = $1";
    const params: any[] = [meetingId];
    if (organizationId) {
      query += " AND (organization_id = $2 OR organization_id IS NULL)";
      params.push(organizationId);
    }
    query += " ORDER BY created_at ASC;";

    const { rows } = await db.query(query, params);
    return rows.map((r) => ({
      id: r.id,
      meetingId: r.meeting_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderAvatarColor: r.sender_avatar_color || "#D96B43",
      senderInitials: r.sender_initials || "ME",
      text: r.text,
      timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      createdAt: r.created_at,
    }));
  }

  static async createMeetingMessage(
    meetingId: string,
    data: { text: string; senderName?: string; senderAvatarColor?: string; senderInitials?: string },
    organizationId?: string | null,
    user?: any
  ) {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const senderId = user?.id || "guest";
    const senderName = user?.name || data.senderName || "Attendee";
    const senderAvatarColor = user?.avatarColor || data.senderAvatarColor || "#D96B43";
    const senderInitials = user?.initials || data.senderInitials || senderName.slice(0, 2).toUpperCase();

    const { rows } = await db.query(
      `INSERT INTO meeting_messages (id, meeting_id, sender_id, sender_name, sender_avatar_color, sender_initials, text, created_at, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
       RETURNING *;`,
      [
        id,
        meetingId,
        senderId,
        senderName,
        senderAvatarColor,
        senderInitials,
        data.text,
        organizationId || null,
      ]
    );

    const r = rows[0];
    return {
      id: r.id,
      meetingId: r.meeting_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderAvatarColor: r.sender_avatar_color,
      senderInitials: r.sender_initials,
      text: r.text,
      timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      createdAt: r.created_at,
    };
  }
}
