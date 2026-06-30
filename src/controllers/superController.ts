import { Request, Response, NextFunction } from "express";
import { SuperService } from "../services/superService.js";

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
}
