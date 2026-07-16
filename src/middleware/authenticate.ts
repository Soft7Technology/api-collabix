import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/auth.js";
import { db } from "../db/index.js";

/**
 * Middleware to authenticate requests using access token from cookies.
 * Attaches user details and permissions to req.user.
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    let token = req.cookies?.access_token;
    
    // Check Authorization header fallback
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      res.status(401).json({
        error: {
          message: "Authentication token is missing. Please log in.",
          status: 401,
        },
      });
      return;
    }

    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.userId) {
      res.status(401).json({
        error: {
          message: "Invalid or expired access token.",
          status: 401,
        },
      });
      return;
    }

    // Query DB to ensure user exists and is active, joining with roles and organizations
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role_id, u.status, u.department_id, u.is_super_admin, u.organization_id,
              r.name as role_name, r.rank as role_rank,
              o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = $1;`,
      [decoded.userId],
    );
    const user = rows[0];

    if (!user) {
      res.status(401).json({
        error: {
          message: "Authenticated user not found.",
          status: 401,
        },
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(401).json({
        error: {
          message: "User account is not active.",
          status: 401,
        },
      });
      return;
    }

    // Fetch user permissions associated with their role
    const permResult = await db.query(
      "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
      [user.role_id],
    );
    const permissions = permResult.rows.map((r) => r.permission_name);

    req.user = {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      permissions,
      role_name: user.role_name,
      role_rank: user.role_rank,
      department_id: user.department_id,
      is_super_admin: user.is_super_admin,
      organization_id: user.organization_id,
      organization: user.organization_id
        ? {
            id: user.organization_id,
            name: user.org_name,
            timezone: user.timezone,
            subscription_status: user.subscription_status,
            trial_ends_at: user.trial_ends_at,
            is_approved: user.org_is_approved,
          }
        : null,
    };

    next();
  } catch (error) {
    next(error);
  }
}
