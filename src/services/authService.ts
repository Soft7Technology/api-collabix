import crypto from "crypto";
import { pool, db } from "../db/index.js";
import {
  comparePassword,
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
} from "../utils/auth.js";
import { config } from "../config/index.js";
import { emailService } from "./emailService.js";

/**
 * SHA-256 hash helper for secure tokens (invitations & refresh tokens).
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  /**
   * Log in user with email and password.
   */
  static async login(email: string, password?: string) {
    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role_id, u.status, u.is_super_admin, u.organization_id, u.department_id,
              r.name as role_name, r.rank as role_rank,
              d.name as department_name,
              o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = $1;`,
      [email.toLowerCase().trim()],
    );
    const user = rows[0];

    if (!user) {
      throw new Error("Invalid email or password.");
    }

    if (user.status !== "ACTIVE") {
      throw new Error("User account is inactive or pending invitation.");
    }

    if (!user.password_hash) {
      throw new Error(
        "Password has not been configured. Please verify your invitation.",
      );
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      throw new Error("Invalid email or password.");
    }

    // Fetch user permissions
    const permResult = await db.query(
      "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
      [user.role_id],
    );
    const permissions = permResult.rows.map((r) => r.permission_name);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.role_id,
      roleName: user.role_name,
      roleRank: user.role_rank,
      departmentId: user.department_id,
      departmentName: user.department_name,
      isSuperAdmin: user.is_super_admin,
      organizationId: user.organization_id,
      organization: user.organization_id
        ? {
            id: user.organization_id,
            name: user.org_name,
            timezone: user.org_timezone,
            subscriptionStatus: user.subscription_status,
            trialEndsAt: user.trial_ends_at,
            isApproved: user.org_is_approved,
          }
        : null,
      permissions,
    };
  }

  /**
   * Verify an invitation token without updating the database (read-only).
   */
  static async verifyInviteToken(rawToken: string) {
    if (!rawToken) {
      throw new Error("Invitation token is required.");
    }

    const hexMatch = rawToken.match(/[0-9a-fA-F]{64}/);
    const cleanToken = hexMatch ? hexMatch[0] : rawToken.trim().slice(0, 64);
    const tokenHash = hashToken(cleanToken);
    const { rows } = await db.query(
      `SELECT ui.expires_at, ui.is_used, u.email, u.name 
       FROM user_invitations ui 
       JOIN users u ON ui.user_id = u.id 
       WHERE ui.token_hash = $1;`,
      [tokenHash],
    );
    const invite = rows[0];

    if (!invite) {
      throw new Error("Invalid invitation token.");
    }

    if (invite.is_used) {
      throw new Error("Invitation token has already been used.");
    }

    if (new Date(invite.expires_at) < new Date()) {
      throw new Error("Invitation token has expired.");
    }

    return {
      email: invite.email,
      name: invite.name,
    };
  }

  /**
   * Setup password and activate user inside a SQL transaction.
   */
  static async setupPassword(rawToken: string, password?: string) {
    if (!rawToken || !password) {
      throw new Error("Token and password are required.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const hexMatch = rawToken.match(/[0-9a-fA-F]{64}/);
    const cleanToken = hexMatch ? hexMatch[0] : rawToken.trim().slice(0, 64);
    const tokenHash = hashToken(cleanToken);
    const client = await pool.connect();

    try {
      await client.query("BEGIN;");

      // 1. Fetch and lock invitation row
      const inviteResult = await client.query(
        `SELECT id, user_id, expires_at, is_used 
         FROM user_invitations 
         WHERE token_hash = $1 FOR UPDATE;`,
        [tokenHash],
      );
      const invite = inviteResult.rows[0];

      if (!invite) {
        throw new Error("Invalid invitation token.");
      }

      if (invite.is_used) {
        throw new Error("Invitation token has already been used.");
      }

      if (new Date(invite.expires_at) < new Date()) {
        throw new Error("Invitation token has expired.");
      }

      // 2. Hash new password
      const hashedPassword = await hashPassword(password);

      // 3. Update user status and password
      await client.query(
        `UPDATE users 
         SET password_hash = $1, status = 'ACTIVE', updated_at = NOW() 
         WHERE id = $2;`,
        [hashedPassword, invite.user_id],
      );

      const userDetails = await client.query(
        `SELECT u.id, u.name, u.email, u.role_id, u.is_super_admin, u.organization_id, u.department_id,
                r.name as role_name, r.rank as role_rank,
                d.name as department_name,
                o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = $1;`,
        [invite.user_id],
      );
      const user = userDetails.rows[0];

      if (!user) {
        throw new Error("User associated with this invitation does not exist.");
      }

      // 4. Mark invitation as used
      await client.query(
        "UPDATE user_invitations SET is_used = TRUE WHERE id = $1;",
        [invite.id],
      );

      // 5. Fetch role permissions
      const permResult = await client.query(
        "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
        [user.role_id],
      );
      const permissions = permResult.rows.map((r: any) => r.permission_name);

      await client.query("COMMIT;");

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
        roleRank: user.role_rank,
        departmentId: user.department_id,
        departmentName: user.department_name,
        isSuperAdmin: user.is_super_admin,
        organizationId: user.organization_id,
        organization: user.organization_id
          ? {
              id: user.organization_id,
              name: user.org_name,
              timezone: user.org_timezone,
              subscriptionStatus: user.subscription_status,
              trialEndsAt: user.trial_ends_at,
              isApproved: user.org_is_approved,
            }
          : null,
        permissions,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Refreshes user session by validating and rotating the refresh token.
   */
  static async refreshSession(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new Error("Refresh token is required.");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const client = await pool.connect();

    try {
      await client.query("BEGIN;");

      // Fetch and lock refresh token record
      const tokenResult = await client.query(
        `SELECT id, user_id, expires_at, revoked_at 
         FROM refresh_tokens 
         WHERE token_hash = $1 FOR UPDATE;`,
        [tokenHash],
      );
      const rt = tokenResult.rows[0];

      if (!rt) {
        throw new Error("Invalid refresh token.");
      }

      if (rt.revoked_at) {
        throw new Error("Refresh token has been revoked.");
      }

      if (new Date(rt.expires_at) < new Date()) {
        throw new Error("Refresh token has expired.");
      }

      // Fetch user profile, joining with roles and organizations
      const userResult = await client.query(
        `SELECT u.id, u.name, u.email, u.role_id, u.status, u.is_super_admin, u.organization_id, u.department_id,
                r.name as role_name, r.rank as role_rank,
                d.name as department_name,
                o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone as org_timezone
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = $1;`,
        [rt.user_id],
      );
      const user = userResult.rows[0];

      if (!user || user.status !== "ACTIVE") {
        throw new Error("User account is inactive or deleted.");
      }

      // Fetch role permissions
      const permResult = await client.query(
        "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
        [user.role_id],
      );
      const permissions = permResult.rows.map((r: any) => r.permission_name);

      // Rotate Refresh Token: Revoke current
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1;",
        [rt.id],
      );

      // Generate new refresh token
      const newRawRt = crypto.randomBytes(40).toString("hex");
      const newRtHash = hashToken(newRawRt);
      // Expiration time is 30 days from now
      const newRtExpires = new Date();
      newRtExpires.setDate(newRtExpires.getDate() + 30);

      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
         VALUES ($1, $2, $3);`,
        [user.id, newRtHash, newRtExpires],
      );

      await client.query("COMMIT;");

      const userPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.role_id,
        roleName: user.role_name,
        roleRank: user.role_rank,
        departmentId: user.department_id,
        departmentName: user.department_name,
        isSuperAdmin: user.is_super_admin,
        organizationId: user.organization_id,
        organization: user.organization_id
          ? {
              id: user.organization_id,
              name: user.org_name,
              timezone: user.org_timezone,
              subscriptionStatus: user.subscription_status,
              trialEndsAt: user.trial_ends_at,
              isApproved: user.org_is_approved,
            }
          : null,
        permissions,
      };

      return {
        user: userPayload,
        newRawRefreshToken: newRawRt,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke a refresh token on logout.
   */
  static async revokeRefreshToken(rawRefreshToken: string) {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    await db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL;",
      [tokenHash],
    );
  }

  /**
   * Register a new organization and its company admin.
   */
  static async register(params: {
    companyName: string;
    fullName: string;
    email: string;
    phone: string;
    password?: string;
  }) {
    const { companyName, fullName, email, phone, password } = params;

    if (!companyName || !fullName || !email || !password) {
      throw new Error(
        "All fields (Company Name, Full Name, Email, Password) are required.",
      );
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const emailLower = email.toLowerCase().trim();
    const companyTrimmed = companyName.trim();

    // Check if user exists
    const userCheck = await db.query("SELECT id FROM users WHERE email = $1;", [
      emailLower,
    ]);
    if (userCheck.rows[0]) {
      throw new Error("A user with this email address is already registered.");
    }

    // Check if organization name is already taken
    const orgCheck = await db.query(
      "SELECT id FROM organizations WHERE LOWER(name) = LOWER($1);",
      [companyTrimmed],
    );
    if (orgCheck.rows[0]) {
      throw new Error(
        "An organization with this company name is already registered.",
      );
    }

    // Resolve Admin role ID
    const roleRes = await db.query(
      "SELECT id FROM roles WHERE name = 'Admin';",
    );
    const adminRoleId = roleRes.rows[0]?.id;
    if (!adminRoleId) {
      throw new Error("System Admin role is missing. Please contact support.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create Organization (expires in 3 days, pending approval)
      const orgResult = await client.query(
        `INSERT INTO organizations (name, phone, subscription_status, trial_ends_at, is_approved)
         VALUES ($1, $2, 'trial', NOW() + INTERVAL '3 days', FALSE)
         RETURNING id, name, subscription_status, trial_ends_at, is_approved;`,
        [companyTrimmed, phone.trim()],
      );
      const organization = orgResult.rows[0];

      // 2. Hash Password
      const passwordHash = await hashPassword(password);

      // 3. Generate initials and avatar color
      const colors = [
        "var(--terracotta)",
        "var(--mustard)",
        "var(--sage)",
        "var(--plum)",
        "var(--ink)",
        "#3b82f6",
      ];
      const avatarColor = colors[Math.floor(Math.random() * colors.length)];
      const initials = fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      const userId = `u${Date.now()}`;

      // 4. Create Admin User
      const userResult = await client.query(
        `INSERT INTO users (id, name, role, email, avatar_color, initials, password_hash, role_id, status, is_super_admin, organization_id)
         VALUES ($1, $2, 'Admin', $3, $4, $5, $6, $7, 'ACTIVE', FALSE, $8)
         RETURNING id, name, email, role, role_id, status, is_super_admin;`,
        [
          userId,
          fullName.trim(),
          emailLower,
          avatarColor,
          initials,
          passwordHash,
          adminRoleId,
          organization.id,
        ],
      );
      const user = userResult.rows[0];

      await client.query("COMMIT;");

      return {
        user,
        organization,
      };
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Request a password reset.
   */
  static async requestPasswordReset(email: string): Promise<void> {
    if (!email) {
      throw new Error("Email is required.");
    }

    const emailLower = email.toLowerCase().trim();

    // Check if the user exists
    const userRes = await pool.query("SELECT id FROM users WHERE email = $1;", [
      emailLower,
    ]);
    const user = userRes.rows[0];

    // If user does not exist, return silently to prevent email enumeration
    if (!user) {
      console.log(
        `🔍 Password reset requested for unregistered email: ${emailLower}. Ignoring silently.`,
      );
      return;
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token hash to database
    await pool.query(
      `INSERT INTO password_resets (email, token_hash, expires_at)
       VALUES ($1, $2, $3);`,
      [emailLower, tokenHash, expiresAt],
    );

    // Send email
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(emailLower)}`;
    await emailService.sendPasswordResetEmail(emailLower, resetUrl);
  }

  /**
   * Verify password reset token.
   */
  static async verifyResetToken(
    email: string,
    token: string,
  ): Promise<boolean> {
    if (!email || !token) {
      return false;
    }

    const emailLower = email.toLowerCase().trim();
    const tokenHash = hashToken(token.trim());

    const resetRes = await pool.query(
      `SELECT id FROM password_resets
       WHERE email = $1 AND token_hash = $2 AND is_used = FALSE AND expires_at > NOW();`,
      [emailLower, tokenHash],
    );

    return resetRes.rows.length > 0;
  }

  /**
   * Reset user password using token.
   */
  static async resetPassword(
    email: string,
    token: string,
    newPassword?: string,
  ): Promise<void> {
    if (!email || !token || !newPassword) {
      throw new Error("Email, token, and new password are required.");
    }

    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const emailLower = email.toLowerCase().trim();
    const tokenHash = hashToken(token.trim());

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // Verify token
      const resetRes = await client.query(
        `SELECT id FROM password_resets
         WHERE email = $1 AND token_hash = $2 AND is_used = FALSE AND expires_at > NOW()
         FOR UPDATE;`,
        [emailLower, tokenHash],
      );

      if (resetRes.rows.length === 0) {
        throw new Error("Invalid or expired password reset token.");
      }

      // Hash password
      const hashedPassword = await hashPassword(newPassword);

      // Update password
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2;`,
        [hashedPassword, emailLower],
      );

      // Mark token as used
      await client.query(
        `UPDATE password_resets SET is_used = TRUE WHERE email = $1 AND token_hash = $2;`,
        [emailLower, tokenHash],
      );

      await client.query("COMMIT;");
    } catch (error) {
      await client.query("ROLLBACK;");
      throw error;
    } finally {
      client.release();
    }
  }
}
