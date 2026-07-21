import { Request, Response, NextFunction } from "express";
import { SuperService } from "../services/superService.js";
import { AuthController } from "./authController.js";

export class SuperController {
  /**
   * GET /api/super/organizations
   */
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res
          .status(403)
          .json({
            error: {
              message: "Forbidden: Super Admin access required.",
              status: 403,
            },
          });
        return;
      }

      const orgs = await SuperService.getAllOrganizations();
      res.json(orgs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/super/organizations/:id/approve
   */
  static async approve(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res
          .status(403)
          .json({
            error: {
              message: "Forbidden: Super Admin access required.",
              status: 403,
            },
          });
        return;
      }

      const { id } = req.params;
      const updated = await SuperService.approveOrganization(id);
      res.json({
        message: "Organization successfully approved.",
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * POST /api/super/organizations/:id/revoke
   */
  static async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res
          .status(403)
          .json({
            error: {
              message: "Forbidden: Super Admin access required.",
              status: 403,
            },
          });
        return;
      }

      const { id } = req.params;
      const updated = await SuperService.revokeOrganization(id);
      res.json({
        message: "Organization successfully revoked.",
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * DELETE /api/super/organizations/:id
   */
  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res
          .status(403)
          .json({
            error: {
              message: "Forbidden: Super Admin access required.",
              status: 403,
            },
          });
        return;
      }

      const { id } = req.params;
      await SuperService.deleteOrganization(id);
      res.json({
        message: "Organization successfully deleted.",
        id,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * POST /api/super/organizations/:id/impersonate
   */
  static async impersonate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res
          .status(403)
          .json({
            error: {
              message: "Forbidden: Super Admin access required.",
              status: 403,
            },
          });
        return;
      }

      const { id } = req.params;
      const { user, organization, rawRefreshToken } = await SuperService.impersonateOrganization(id);

      AuthController.setAuthCookies(req, res, user.id, rawRefreshToken);

      const clientAppUrl = process.env.CLIENT_APP_URL || (process.env.NODE_ENV === "production" ? "https://collabix.soft7.in" : "http://localhost:8001");

      res.json({
        message: `Successfully impersonated organization '${organization.name}'.`,
        user,
        organization,
        redirectUrl: clientAppUrl,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }
}
