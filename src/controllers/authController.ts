import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AuthService, hashToken } from "../services/authService.js";
import {
  generateAccessToken,
  generateRefreshToken,
  comparePassword,
  hashPassword,
} from "../utils/auth.js";
import { db } from "../db/index.js";
import { config } from "../config/index.js";

// Cookie configurations
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  domain: config.COOKIE_DOMAIN || undefined,
};

const ACCESS_COOKIE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AuthController {
  /**
   * Helper to set access, refresh, and CSRF cookies in response.
   */
  private static setAuthCookies(
    req: Request,
    res: Response,
    userId: string,
    rawRefreshToken: string,
  ) {
    const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";
    const domainValue = isLocalhost ? undefined : (config.COOKIE_DOMAIN || undefined);

    // 1. Access Token Cookie
    const accessToken = generateAccessToken({ userId });
    res.cookie("access_token", accessToken, {
      ...cookieOptions,
      domain: domainValue,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });

    // 2. Refresh Token Cookie
    res.cookie("refresh_token", rawRefreshToken, {
      ...cookieOptions,
      domain: domainValue,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });

    // 3. CSRF Token Cookie (non-httpOnly so client can read it)
    const csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: domainValue,
    });
  }

  /**
   * POST /auth/register
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { companyName, fullName, email, phone, password } = req.body;
      const result = await AuthService.register({
        companyName,
        fullName,
        email,
        phone,
        password,
      });

      res.status(201).json({
        message: "Organization registered successfully. Please sign in.",
        user: result.user,
        organization: result.organization,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * POST /auth/login
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const user = await AuthService.login(email, password);

      // Backend role-based origin gate
      const origin = req.headers.origin;
      if (origin) {
        const isFromAdminApp =
          origin.includes("localhost:8081") ||
          origin.includes("localhost:8002") ||
          origin.includes("admin.") ||
          origin.includes("portal.");

        if (user.isSuperAdmin && !isFromAdminApp) {
          res.status(403).json({
            error: {
              message:
                "Super-admins are not allowed to log in via the customer application.",
              status: 403,
            },
          });
          return;
        }

        if (!user.isSuperAdmin && isFromAdminApp) {
          res.status(403).json({
            error: {
              message:
                "Only platform administrators are allowed to log in here.",
              status: 403,
            },
          });
          return;
        }
      }

      // Generate Refresh Token
      const rawRefreshToken = crypto.randomBytes(40).toString("hex");
      const rfHash = hashToken(rawRefreshToken);
      const rfExpires = new Date();
      rfExpires.setDate(rfExpires.getDate() + 30);

      // Save refresh token in DB
      await db.query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3);",
        [user.id, rfHash, rfExpires],
      );

      // Set cookies
      AuthController.setAuthCookies(req, res, user.id, rawRefreshToken);

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roleId: user.roleId,
          roleName: user.roleName,
          roleRank: user.roleRank,
          canCreateTasks: user.canCreateTasks,
          isSuperAdmin: user.isSuperAdmin,
          organizationId: user.organizationId,
          organization: user.organization,
        },
        permissions: user.permissions,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * POST /auth/refresh
   */
  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        res.status(400).json({
          error: { message: "Refresh token is missing.", status: 400 },
        });
        return;
      }

      const { user, newRawRefreshToken } =
        await AuthService.refreshSession(refreshToken);

      // Set new rotated cookies
      AuthController.setAuthCookies(req, res, user.id, newRawRefreshToken);

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roleId: user.roleId,
          roleName: user.roleName,
          roleRank: user.roleRank,
          isSuperAdmin: user.isSuperAdmin,
          organizationId: user.organizationId,
          organization: user.organization,
        },
        permissions: user.permissions,
      });
    } catch (error: any) {
      res.status(401).json({ error: { message: error.message, status: 401 } });
    }
  }

  /**
   * POST /auth/setup-password
   */
  static async setupPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = req.body;
      const user = await AuthService.setupPassword(token, password);

      // Generate Refresh Token
      const rawRefreshToken = crypto.randomBytes(40).toString("hex");
      const rfHash = hashToken(rawRefreshToken);
      const rfExpires = new Date();
      rfExpires.setDate(rfExpires.getDate() + 30);

      // Save refresh token in DB
      await db.query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3);",
        [user.id, rfHash, rfExpires],
      );

      // Set cookies
      AuthController.setAuthCookies(req, res, user.id, rawRefreshToken);

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roleId: user.roleId,
          roleName: user.roleName,
          roleRank: user.roleRank,
          isSuperAdmin: user.isSuperAdmin,
          organizationId: user.organizationId,
          organization: user.organization,
        },
        permissions: user.permissions,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * POST /auth/logout
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (refreshToken) {
        await AuthService.revokeRefreshToken(refreshToken);
      }

      // Clear all authentication and CSRF cookies
      res.clearCookie("access_token", { path: "/" });
      res.clearCookie("refresh_token", { path: "/" });
      res.clearCookie("csrf_token", { path: "/" });

      res.json({ message: "Successfully logged out." });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/verify-invite
   */
  static async verifyInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.query.token as string;
      const inviteData = await AuthService.verifyInviteToken(token);
      res.json(inviteData);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * GET /auth/me
   */
  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userSession = req.user;
      if (!userSession) {
        res
          .status(401)
          .json({ error: { message: "Unauthorized.", status: 401 } });
        return;
      }

      // Fetch complete user profile data
      const { rows } = await db.query(
        `SELECT u.id, u.name, u.email, u.avatar_color AS "avatarColor", u.initials, u.role_id AS "roleId", u.status, u.is_super_admin AS "isSuperAdmin", u.organization_id AS "organizationId", u.department_id AS "departmentId", u.can_create_tasks AS "canCreateTasks",
                r.name AS "roleName", r.rank AS "roleRank",
                d.name AS "departmentName",
                o.name AS "orgName", o.subscription_status AS "subscriptionStatus", o.trial_ends_at AS "trialEndsAt", o.is_approved AS "orgIsApproved", o.timezone AS "orgTimezone"
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = $1;`,
        [userSession.id],
      );
      const user = rows[0];

      if (!user) {
        res
          .status(404)
          .json({ error: { message: "User not found.", status: 404 } });
        return;
      }

      const mappedUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        initials: user.initials,
        roleId: user.roleId,
        roleName: user.roleName,
        roleRank: user.roleRank,
        canCreateTasks: !!user.canCreateTasks,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        organizationId: user.organizationId,
        organization: user.organizationId
          ? {
              id: user.organizationId,
              name: user.orgName,
              timezone: user.orgTimezone,
              subscriptionStatus: user.subscriptionStatus,
              trialEndsAt: user.trialEndsAt,
              isApproved: user.orgIsApproved,
            }
          : null,
      };

      res.json({
        user: mappedUser,
        permissions: userSession.permissions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/profile
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res
          .status(401)
          .json({ error: { message: "Unauthorized.", status: 401 } });
        return;
      }
      const { name, email } = req.body;
      const initials = name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      // Check if email is already taken by another user
      const { rows: existing } = await db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2;",
        [email.toLowerCase().trim(), req.user.id],
      );
      if (existing.length > 0) {
        res.status(400).json({
          error: {
            message: "Email is already in use by another user.",
            status: 400,
          },
        });
        return;
      }

      await db.query(
        "UPDATE users SET name = $1, email = $2, initials = $3, updated_at = NOW() WHERE id = $4;",
        [name, email.toLowerCase().trim(), initials, req.user.id],
      );

      res.json({ message: "Profile updated successfully." });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * POST /api/users/change-password
   */
  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res
          .status(401)
          .json({ error: { message: "Unauthorized.", status: 401 } });
        return;
      }
      const { currentPassword, newPassword } = req.body;
      const { rows } = await db.query(
        "SELECT password_hash FROM users WHERE id = $1;",
        [req.user.id],
      );
      const user = rows[0];
      if (!user || !user.password_hash) {
        res.status(400).json({
          error: {
            message: "User account not configured correctly.",
            status: 400,
          },
        });
        return;
      }

      const isValid = await comparePassword(
        currentPassword,
        user.password_hash,
      );
      if (!isValid) {
        res.status(400).json({
          error: { message: "Incorrect current password.", status: 400 },
        });
        return;
      }

      const newHash = await hashPassword(newPassword);
      await db.query(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;",
        [newHash, req.user.id],
      );

      res.json({ message: "Password updated successfully." });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * PATCH /api/organization
   */
  static async updateOrganization(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user || !req.user.organization_id) {
        res.status(400).json({
          error: {
            message: "User is not associated with an organization.",
            status: 400,
          },
        });
        return;
      }
      // Verify admin permission
      const hasAdminManage =
        req.user.permissions.includes("*") ||
        req.user.permissions.includes("admin:manage");
      if (!hasAdminManage) {
        res.status(403).json({
          error: {
            message: "Forbidden: Admin access required.",
            status: 403,
          },
        });
        return;
      }

      const { name, timezone } = req.body;

      // Check if organization name is already taken
      const { rows: existing } = await db.query(
        "SELECT id FROM organizations WHERE LOWER(name) = LOWER($1) AND id != $2;",
        [name.trim(), req.user.organization_id],
      );
      if (existing.length > 0) {
        res.status(400).json({
          error: {
            message:
              "An organization with this company name is already registered.",
            status: 400,
          },
        });
        return;
      }

      await db.query(
        "UPDATE organizations SET name = $1, timezone = $2, updated_at = NOW() WHERE id = $3;",
        [name.trim(), timezone, req.user.organization_id],
      );

      res.json({ message: "Organization updated successfully." });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      if (!email) {
        res
          .status(400)
          .json({ error: { message: "Email is required.", status: 400 } });
        return;
      }
      await AuthService.requestPasswordReset(email);
      res.json({
        message:
          "If the email is registered, a password reset link has been sent.",
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async verifyResetToken(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { email, token } = req.query;
      if (!email || !token) {
        res.status(400).json({
          error: { message: "Email and token are required.", status: 400 },
        });
        return;
      }
      const isValid = await AuthService.verifyResetToken(
        String(email),
        String(token),
      );
      if (!isValid) {
        res.status(400).json({
          error: {
            message: "Invalid or expired password reset link.",
            status: 400,
          },
        });
        return;
      }
      res.json({ valid: true });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, token, password } = req.body;
      if (!email || !token || !password) {
        res.status(400).json({
          error: {
            message: "Email, token, and password are required.",
            status: 400,
          },
        });
        return;
      }
      await AuthService.resetPassword(email, token, password);
      res.json({ message: "Password updated successfully." });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }
}
