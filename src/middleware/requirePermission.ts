import { Request, Response, NextFunction } from "express";

/**
 * Middleware to restrict route access based on required permissions.
 * Grants access if user permissions contain either the wildcard '*' or the required permission name.
 */
export function requirePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        error: {
          message: "Authentication is required.",
          status: 401,
        },
      });
      return;
    }

    const hasWildcard = user.permissions.includes("*");
    const hasRequired = user.permissions.includes(requiredPermission);

    if (!hasWildcard && !hasRequired) {
      res.status(403).json({
        error: {
          message:
            "Forbidden: You do not have the required permissions to perform this action.",
          status: 403,
        },
      });
      return;
    }

    next();
  };
}
