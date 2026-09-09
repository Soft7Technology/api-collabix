import { Request, Response, NextFunction } from "express";
import { SuperService } from "../../services/superService.js";
import { AuthController } from "../auth/authController.js";

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
   * POST /api/super/organizations
   */
  static async createOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: {
            message: "Forbidden: Super Admin access required.",
            status: 403,
          },
        });
        return;
      }

      const { name, ownerEmail, phone, plan } = req.body;
      const org = await SuperService.createOrganization({ name, ownerEmail, phone, plan });
      res.status(201).json(org);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
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
   * PATCH /api/super/organizations/:id
   */
  static async updateOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const { id } = req.params;
      const { name, phone, subscriptionStatus, trialEndsAt, plan, isApproved } = req.body;

      const updated = await SuperService.updateOrganization(id, {
        name,
        phone,
        subscriptionStatus,
        trialEndsAt,
        plan,
        isApproved,
      });

      res.json({
        message: `Organization '${updated.name}' updated successfully.`,
        organization: updated,
      });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * PATCH /api/super/organizations/:id/plan
   */
  static async updatePlan(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const { id } = req.params;
      const { plan } = req.body;
      if (!plan) {
        res.status(400).json({ error: { message: "Plan is required.", status: 400 } });
        return;
      }

      const updated = await SuperService.updateOrganizationPlan(id, plan);
      res.json({
        message: `Plan updated to '${updated.plan}' successfully.`,
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

  /**
   * GET /api/super/users
   */
  static async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const users = await SuperService.getAllUsers();
      res.json(users);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/super/users/:id
   */
  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const { id } = req.params;
      const { name, email, roleName, status } = req.body;

      const updated = await SuperService.updateUser(id, { name, email, roleName, status });
      res.json({ message: "User updated successfully.", user: updated });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * PATCH /api/super/users/:id/role
   */
  static async updateUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const { id } = req.params;
      const { roleName } = req.body;
      if (!roleName) {
        res.status(400).json({ error: { message: "Role name is required.", status: 400 } });
        return;
      }

      const updated = await SuperService.updateUserRole(id, roleName);
      res.json({ message: "User role updated successfully.", user: updated });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * PATCH /api/super/users/:id/status
   */
  static async updateUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const { id } = req.params;
      const { status } = req.body;
      if (!status) {
        res.status(400).json({ error: { message: "Status is required.", status: 400 } });
        return;
      }

      const updated = await SuperService.updateUserStatus(id, status);
      res.json({ message: "User status updated successfully.", user: updated });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * DELETE /api/super/users/:id
   */
  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const { id } = req.params;
      await SuperService.deleteUser(id);
      res.json({ message: "User deleted successfully.", id });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }

  /**
   * GET /api/super/logs
   */
  static async getSystemLogs(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.is_super_admin) {
        res.status(403).json({
          error: { message: "Forbidden: Super Admin access required.", status: 403 },
        });
        return;
      }

      const logs = await SuperService.getSystemLogs();
      res.json(logs);
    } catch (error) {
      next(error);
    }
  }
}
