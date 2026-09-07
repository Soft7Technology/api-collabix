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
      `SELECT u.id, u.email, u.role_id, u.status, u.department_id, u.is_super_admin, u.organization_id, u.can_create_tasks,
              d.name as department_name,
              r.name as role_name, r.rank as role_rank,
              o.name as org_name, o.subscription_status, o.trial_ends_at, o.is_approved as org_is_approved, o.timezone, o.created_at as org_created_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
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
      res.status(403).json({
        error: {
          message: "User account is suspended or inactive. Please contact support.",
          status: 403,
        },
      });
      return;
    }

    // Fetch user permissions associated with their role
    const permResult = await db.query(
      "SELECT permission_name FROM role_permissions WHERE role_id = $1;",
      [user.role_id],
    );
    const permissions = permResult.rows.map((r: any) => r.permission_name);

    req.user = {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      permissions,
      role_name: user.role_name,
      role_rank: user.role_rank,
      can_create_tasks: !!user.can_create_tasks,
      department_id: user.department_id,
      department_name: user.department_name,
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
            created_at: user.org_created_at,
          }
        : null,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Guard middleware: Restricts Code & Repository section for Marketing and Sales departments.
 */
export function requireCodeAccess(req: Request, res: Response, next: NextFunction) {
  if (
    req.user?.is_super_admin ||
    req.user?.role_name === "Admin" ||
    req.user?.role_name === "Super Admin" ||
    req.user?.role_rank === 1 ||
    req.user?.permissions?.includes("admin:manage")
  ) {
    return next();
  }

  const dept = (req.user?.department_name || "").trim().toLowerCase();
  if (dept === "marketing" || dept === "sales") {
    res.status(403).json({
      error: {
        message: `The Code & Repository section is restricted for members of the ${req.user?.department_name} department.`,
        status: 403,
      },
    });
    return;
  }

  next();
}
