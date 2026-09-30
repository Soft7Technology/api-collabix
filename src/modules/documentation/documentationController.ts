import { Request, Response, NextFunction } from "express";
import { DocumentationService } from "../../services/documentationService.js";
import { DashboardService } from "../../services/dashboardService.js";

export class DocumentationController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const {
        type,
        status,
        project,
        employeeId,
        departmentId,
        search,
        onlyMine,
        roleFilter,
      } = req.query;

      const userCtx = req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
            permissions: req.user.permissions || [],
          }
        : undefined;

      const reports = await DocumentationService.getAll({
        type: (type as any) || undefined,
        status: (status as string) || undefined,
        project: (project as string) || undefined,
        employeeId: (employeeId as string) || undefined,
        departmentId: (departmentId as string) || undefined,
        search: (search as string) || undefined,
        onlyMine: onlyMine === "true",
        roleFilter: (roleFilter as any) || undefined,
        organizationId,
        userCtx,
      });

      res.json(reports);
    } catch (error) {
      next(error);
    }
  }

  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const { type, project, employeeId, departmentId, roleFilter } = req.query;

      const userCtx = req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
            permissions: req.user.permissions || [],
          }
        : undefined;

      const summary = await DocumentationService.getDashboardSummary({
        type: (type as any) || undefined,
        project: (project as string) || undefined,
        employeeId: (employeeId as string) || undefined,
        departmentId: (departmentId as string) || undefined,
        roleFilter: (roleFilter as any) || undefined,
        organizationId,
        userCtx,
      });

      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;

      const userCtx = req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
            permissions: req.user.permissions || [],
          }
        : undefined;

      const report = await DocumentationService.getById(id, organizationId, userCtx);
      if (!report) {
        res.status(404).json({ error: { message: "Report not found", status: 404 } });
        return;
      }

      res.json(report);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user?.organization_id || null;
      const report = await DocumentationService.create(req.body, organizationId, req.user);

      if (req.user && report) {
        const actionVerb = report.status === "submitted" ? "submitted work report" : "saved work report draft";
        await DashboardService.logActivity(
          req.user.id,
          actionVerb,
          report.title,
          report.projectId || undefined
        );
      }

      res.status(201).json(report);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;

      const userCtx = req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
            permissions: req.user.permissions || [],
          }
        : undefined;

      const report = await DocumentationService.update(id, req.body, organizationId, userCtx);
      if (!report) {
        res.status(404).json({ error: { message: "Report not found", status: 404 } });
        return;
      }

      if (req.user && report) {
        const actionVerb =
          report.status === "submitted" ? "resubmitted work report" : "updated work report";
        await DashboardService.logActivity(
          req.user.id,
          actionVerb,
          report.title,
          report.projectId || undefined
        );
      }

      res.json(report);
    } catch (error) {
      next(error);
    }
  }

  static async review(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { action, comment } = req.body;
      const organizationId = req.user?.organization_id || null;

      const report = await DocumentationService.review(
        id,
        action,
        comment,
        organizationId,
        req.user
      );

      if (!report) {
        res.status(404).json({ error: { message: "Report not found", status: 404 } });
        return;
      }

      if (req.user && report) {
        const actionVerb =
          action === "approve" ? "approved work report" : "requested changes on work report";
        await DashboardService.logActivity(
          req.user.id,
          actionVerb,
          report.title,
          report.projectId || undefined
        );
      }

      res.json(report);
    } catch (error: any) {
      if (error?.message) {
        const statusCode = error.status || error.statusCode || (error.message.includes("permission") || error.message.includes("Only managers") ? 403 : 400);
        res.status(statusCode).json({ error: { message: error.message, status: statusCode } });
        return;
      }
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organization_id || null;

      const userCtx = req.user
        ? {
            id: req.user.id,
            name: req.user.name,
            roleName: req.user.role_name || "Teammates",
            roleRank: req.user.role_rank || 4,
            departmentId: req.user.department_id || null,
            organizationId: req.user.organization_id || null,
            isSuperAdmin: req.user.is_super_admin || false,
            permissions: req.user.permissions || [],
          }
        : undefined;

      const success = await DocumentationService.delete(id, organizationId, userCtx);
      if (!success) {
        res.status(404).json({ error: { message: "Report not found", status: 404 } });
        return;
      }

      if (req.user) {
        await DashboardService.logActivity(
          req.user.id,
          "deleted work report",
          `Report ID: ${id}`
        );
      }

      res.json({ success: true, message: "Report deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}
