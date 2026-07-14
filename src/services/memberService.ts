import crypto from "crypto";
import { db, pool } from "../db/index.js";
import { hashToken } from "./authService.js";
import { emailService } from "./emailService.js";
import { config } from "../config/index.js";

export interface TeamMemberInput {
  name: string;
  role: string;
  email: string;
  avatarColor: string;
  initials: string;
}

export class MemberService {
  static async getAll(
    organizationId?: string | null,
    userCtx?: {
      id: string;
      roleName: string;
      roleRank: number;
      departmentId: string | null;
      organizationId?: string | null;
      isSuperAdmin?: boolean;
    },
  ) {
    if (!organizationId) {
      return [];
    }
    const isProd = config.NODE_ENV === "production";
    const interval = isProd ? "10 minutes" : "30 seconds";
    const tickInterval = isProd ? 300 : 10;

    let queryStr = `
      SELECT u.*, d.name as department_name,
        (SELECT COUNT(*)::int FROM screen_logs sl WHERE sl.user_id = u.id AND sl.status = 'active' AND sl.captured_at >= NOW() - CAST($2 AS INTERVAL)) as active_logs,
        (SELECT COUNT(*)::int FROM screen_logs sl WHERE sl.user_id = u.id AND sl.captured_at >= CURRENT_DATE) * $3 as today_seconds
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.organization_id = $1
    `;
    const params: any[] = [organizationId, interval, tickInterval];

    if (userCtx && userCtx.roleRank >= 3) {
      queryStr += ` AND (u.department_id = $4 OR u.id = $5 OR u.id IN (
        SELECT member_id FROM project_members WHERE project_id IN (
          SELECT project_id FROM project_members WHERE member_id = $5
        )
      ))`;
      params.push(userCtx.departmentId || null, userCtx.id);
    }

    const { rows } = await db.query(queryStr, params);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      email: r.email,
      avatarColor: r.avatar_color,
      initials: r.initials,
      roleId: r.role_id,
      departmentId: r.department_id,
      department: r.department_name,
      status: r.active_logs > 0 ? "Active" : "Offline",
      todaySeconds: r.today_seconds || 0,
    }));
  }

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
    },
  ) {
    if (!organizationId) return null;
    const isProd = config.NODE_ENV === "production";
    const interval = isProd ? "10 minutes" : "30 seconds";
    const tickInterval = isProd ? 300 : 10;

    let queryStr = `
      SELECT u.*, d.name as department_name,
        (SELECT COUNT(*)::int FROM screen_logs sl WHERE sl.user_id = u.id AND sl.status = 'active' AND sl.captured_at >= NOW() - CAST($3 AS INTERVAL)) as active_logs,
        (SELECT COUNT(*)::int FROM screen_logs sl WHERE sl.user_id = u.id AND sl.captured_at >= CURRENT_DATE) * $4 as today_seconds
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1 AND u.organization_id = $2
    `;
    const params: any[] = [id, organizationId, interval, tickInterval];

    if (userCtx && userCtx.roleRank >= 3) {
      queryStr += ` AND (u.department_id = $5 OR u.id = $6 OR u.id IN (
        SELECT member_id FROM project_members WHERE project_id IN (
          SELECT project_id FROM project_members WHERE member_id = $6
        )
      ))`;
      params.push(userCtx.departmentId || null, userCtx.id);
    }

    const { rows } = await db.query(queryStr, params);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      email: r.email,
      avatarColor: r.avatar_color,
      initials: r.initials,
      roleId: r.role_id,
      departmentId: r.department_id,
      department: r.department_name,
      status: r.active_logs > 0 ? "Active" : "Offline",
      todaySeconds: r.today_seconds || 0,
    };
  }

  static async create(member: TeamMemberInput, organizationId?: string | null) {
    const id = `u${Date.now()}`;

    // Resolve Member Role ID
    const roleName = member.role.toLowerCase() === "admin" ? "Admin" : "Member";
    const roleRes = await db.query("SELECT id FROM roles WHERE name = $1;", [
      roleName,
    ]);
    const roleId = roleRes.rows[0]?.id;

    const { rows } = await db.query(
      `INSERT INTO users (id, name, role, email, avatar_color, initials, role_id, status, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
       RETURNING *;`,
      [
        id,
        member.name,
        member.role,
        member.email.toLowerCase().trim(),
        member.avatarColor,
        member.initials,
        roleId,
        organizationId || null,
      ],
    );
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      email: r.email,
      avatarColor: r.avatar_color,
      initials: r.initials,
      roleId: r.role_id,
      status: r.status,
    };
  }

  /**
   * Invites a new team member. Creates a user as PENDING_INVITATION,
   * generates a secure invitation token, hashes it, and emails the onboarding link.
   */
  static async invite(
    member: {
      name: string;
      email: string;
      roleId: string;
      departmentId?: string;
      projectId?: string;
    },
    organizationId?: string | null,
  ) {
    const emailLower = member.email.toLowerCase().trim();

    const existing = await db.query("SELECT id FROM users WHERE email = $1;", [
      emailLower,
    ]);

    if (existing.rows[0]) {
      const error = new Error(
        "A user with this email address is already registered.",
      ) as any;
      error.status = 400;
      throw error;
    }

    const roleId = member.roleId;

    const roleRes = await db.query("SELECT name FROM roles WHERE id = $1;", [
      roleId,
    ]);

    const roleName = roleRes.rows[0]?.name;

    if (!roleName) {
      const error = new Error("Invalid role ID.") as any;
      error.status = 400;
      throw error;
    }

    const departmentId = member.departmentId ?? null;

    // Generate random avatar color and initials
    const colors = [
      "var(--terracotta)",
      "var(--mustard)",
      "var(--sage)",
      "var(--plum)",
      "var(--ink)",
      "#3b82f6",
    ];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];
    const initials = member.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const userId = `u${Date.now()}`;
    const client = await pool.connect();

    try {
      await client.query("BEGIN;");

      // Create pending user
      const userRes = await client.query(
        `INSERT INTO users (id, name, role, email, avatar_color, initials, role_id, department_id, status, organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_INVITATION', $9)
         RETURNING *;`,
        [
          userId,
          member.name,
          roleName,
          emailLower,
          avatarColor,
          initials,
          roleId,
          departmentId,
          organizationId || null,
        ],
      );
      const user = userRes.rows[0];

      // Generate secure random token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);

      // Expiry is 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Save invitation details in DB
      await client.query(
        `INSERT INTO user_invitations (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3);`,
        [userId, tokenHash, expiresAt],
      );

      if (member.projectId) {
        await client.query(
          `INSERT INTO project_members (project_id, member_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING;`,
          [member.projectId, userId],
        );
      }

      await client.query("COMMIT;");

      // Send invitation link
      const invitationUrl = `${config.FRONTEND_URL}/setup-password?token=${rawToken}`;
      try {
        await emailService.sendInvitationEmail(emailLower, invitationUrl);
      } catch (emailError) {
        console.error(
          "⚠️ Failed to send invitation email, but user was created:",
          emailError,
        );
        console.log(
          `\n✉️  [Onboarding Fallback Link] Invitation Link for ${emailLower}:`,
        );
        console.log(`\n${invitationUrl}\n`);
      }

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        avatarColor: user.avatar_color,
        initials: user.initials,
        roleId: user.role_id,
        departmentId: user.department_id,
        status: user.status,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateRole(
    id: string,
    role: string,
    organizationId?: string | null,
  ) {
    if (!organizationId) return null;
    const roleRes = await db.query(
      "SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1);",
      [role.trim()],
    );
    const matchedRole = roleRes.rows[0];
    if (!matchedRole) {
      throw new Error(`Role '${role}' not found.`);
    }
    const roleId = matchedRole.id;
    const roleName = matchedRole.name;

    const { rows } = await db.query(
      "UPDATE users SET role = $1, role_id = $2, updated_at = NOW() WHERE id = $3 AND organization_id = $4 RETURNING *;",
      [roleName, roleId, id, organizationId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      email: r.email,
      avatarColor: r.avatar_color,
      initials: r.initials,
      roleId: r.role_id,
      status: r.status,
    };
  }

  static async delete(id: string, organizationId?: string | null) {
    if (!organizationId) return null;
    const { rows } = await db.query(
      "DELETE FROM users WHERE id = $1 AND organization_id = $2 RETURNING *;",
      [id, organizationId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      email: r.email,
      avatarColor: r.avatar_color,
      initials: r.initials,
    };
  }

  static async getRoles() {
    const { rows } = await db.query(
      "SELECT id, name FROM roles ORDER BY name;",
    );
    return rows;
  }

  static async getDepartments(userCtx?: {
    id: string;
    roleName: string;
    roleRank: number;
    departmentId: string | null;
    organizationId?: string | null;
    isSuperAdmin?: boolean;
  }) {
    if (userCtx && userCtx.roleRank >= 3) {
      const { rows } = await db.query(
        "SELECT id, name FROM departments WHERE id = $1 ORDER BY name;",
        [userCtx.departmentId || null],
      );
      return rows;
    }
    const { rows } = await db.query(
      "SELECT id, name FROM departments ORDER BY name;",
    );
    return rows;
  }
}
