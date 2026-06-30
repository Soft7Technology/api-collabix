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
      const member = await MemberService.updateRole(
        id,
        role,
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
          "updated role",
          member.name,
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
}
