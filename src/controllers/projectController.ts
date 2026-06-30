import { Request, Response, NextFunction } from "express";
import { ProjectService } from "../services/projectService.js";
import { DashboardService } from "../services/dashboardService.js";

export class ProjectController {
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
      const projects = await ProjectService.getAll(userCtx);
      res.json(projects);
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
      const project = await ProjectService.getById(id, userCtx);
      if (!project) {
        res
          .status(404)
          .json({ error: { message: "Project not found", status: 404 } });
        return;
      }
      res.json(project);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (
        req.user &&
        req.user.role_rank !== undefined &&
        req.user.role_rank > 3
      ) {
        res
          .status(403)
          .json({
            error: {
              message: "Forbidden: Teammates cannot create projects.",
              status: 403,
            },
          });
        return;
      }
      const project = await ProjectService.create(
        req.body,
        req.user?.organization_id || null,
      );
      if (req.user && project) {
        await DashboardService.logActivity(
          req.user.id,
          "created project",
          project.name,
          project.id,
        );
      }
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
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

      const existingProject = await ProjectService.getById(id, userCtx);
      if (!existingProject) {
        res
          .status(404)
          .json({ error: { message: "Project not found", status: 404 } });
        return;
      }

      const project = await ProjectService.update(
        id,
        req.body,
        req.user?.organization_id || null,
      );
      if (req.user && project) {
        await DashboardService.logActivity(
          req.user.id,
          "updated project",
          project.name,
          project.id,
        );
      }
      res.json(project);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
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

      const existingProject = await ProjectService.getById(id, userCtx);
      if (!existingProject) {
        res
          .status(404)
          .json({ error: { message: "Project not found", status: 404 } });
        return;
      }

      const deletedProject = await ProjectService.delete(
        id,
        req.user?.organization_id || null,
      );
      if (req.user && existingProject) {
        await DashboardService.logActivity(
          req.user.id,
          "deleted project",
          existingProject.name,
          existingProject.id,
        );
      }
      res.status(200).json(deletedProject);
    } catch (error) {
      next(error);
    }
  }
}
