import { Request, Response, NextFunction } from "express";
import { MemberService } from "../services/memberService.js";
import { DashboardService } from "../services/dashboardService.js";

export class MemberController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;
      const members = await MemberService.getAll(
        req.user?.organization_id || null,
        userCtx,
      );
      res.json(members);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;
      const member = await MemberService.getById(
        id,
        req.user?.organization_id || null,
        userCtx,
      );
      if (!member) {
        res
          .status(404)
          .json({ error: { message: "Member not found", status: 404 } });
        return;
      }
      res.json(member);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const member = await MemberService.create(
        req.body,
        req.user?.organization_id || null,
      );
      res.status(201).json(member);
    } catch (error) {
      next(error);
    }
  }

  static async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const userCtx = req.user
        ? {
            id: req.user.id,
            is_super_admin: req.user.is_super_admin || false,
            role_rank: req.user.role_rank || 4,
          }
        : undefined;
      const member = await MemberService.updateRole(
        id,
        role,
        req.user?.organization_id || null,
        userCtx,
      );
      if (!member) {
        res
          .status(404)
          .json({ error: { message: "Member not found", status: 404 } });
        return;
      }
      if (req.user) {
        await DashboardService.logActivity(
          req.user.id,
          "updated role",
          member.name,
        );
      }
      res.json(member);
    } catch (error) {
      next(error);
    }
  }

  static async updatePosition(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { designation } = req.body;
      if (!designation || typeof designation !== "string") {
        res.status(400).json({ error: { message: "Position / designation is required.", status: 400 } });
        return;
      }
      const userCtx = req.user
        ? {
            id: req.user.id,
            is_super_admin: req.user.is_super_admin || false,
            role_rank: req.user.role_rank || 4,
          }
        : undefined;
      const member = await MemberService.updatePosition(
        id,
        designation,
        req.user?.organization_id || null,
        userCtx,
      );
      if (!member) {
        res.status(404).json({ error: { message: "Member not found", status: 404 } });
        return;
      }
      if (req.user) {
        await DashboardService.logActivity(
          req.user.id,
          "updated position",
          `for ${member.name}`,
        );
      }
      res.json(member);
    } catch (error) {
      next(error);
    }
  }

  static async updateDepartment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { departmentId } = req.body;
      const dId = departmentId && departmentId !== "none" ? departmentId : null;
      const userCtx = req.user
        ? {
            id: req.user.id,
            is_super_admin: req.user.is_super_admin || false,
            role_rank: req.user.role_rank || 4,
          }
        : undefined;
      const member = await MemberService.updateDepartment(
        id,
        dId,
        req.user?.organization_id || null,
        userCtx,
      );
      if (!member) {
        res.status(404).json({ error: { message: "Member not found", status: 404 } });
        return;
      }
      if (req.user) {
        await DashboardService.logActivity(
          req.user.id,
          "updated department",
          `for ${member.name}`,
        );
      }
      res.json(member);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const member = await MemberService.delete(
        id,
        req.user?.organization_id || null,
      );
      if (!member) {
        res
          .status(404)
          .json({ error: { message: "Member not found", status: 404 } });
        return;
      }
      if (req.user) {
        await DashboardService.logActivity(
          req.user.id,
          "removed member",
          member.name,
        );
      }
      res.json(member);
    } catch (error) {
      next(error);
    }
  }

  static async invite(req: Request, res: Response, next: NextFunction) {
    try {
      const member = await MemberService.invite(
        req.body,
        req.user?.organization_id || null,
      );
      if (req.user && member) {
        await DashboardService.logActivity(
          req.user.id,
          "invited member",
          member.name,
        );
      }
      res.status(201).json(member);
    } catch (error) {
      next(error);
    }
  }

  static async getRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await MemberService.getRoles();
      res.json(roles);
    } catch (error) {
      next(error);
    }
  }

  static async getDepartments(req: Request, res: Response, next: NextFunction) {
    try {
      const userCtx = req.user
        ? {
            id: req.user.id,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
          }
        : undefined;
      const departments = await MemberService.getDepartments(userCtx);
      res.json(departments);
    } catch (error) {
      next(error);
    }
  }

  static async updateTaskRights(req: Request, res: Response, next: NextFunction) {
    try {
      const userRank = req.user?.role_rank ?? 4;
      const isSuperAdmin = req.user?.is_super_admin;
      if (!isSuperAdmin && userRank > 3) {
        res.status(403).json({
          error: {
            message: "Forbidden: Only Admin, Manager, and Team leader can modify task creation rights.",
            status: 403,
          },
        });
        return;
      }

      const { id } = req.params;
      const { canCreateTasks } = req.body;
      const member = await MemberService.updateTaskRights(
        id,
        req.user?.organization_id || "",
        Boolean(canCreateTasks),
      );
      if (req.user) {
        await DashboardService.logActivity(
          req.user.id,
          `${canCreateTasks ? "granted" : "revoked"} task creation rights for`,
          member.name,
        );
      }
      res.json(member);
    } catch (error) {
      next(error);
    }
  }
}
