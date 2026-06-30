import { Request, Response, NextFunction } from "express";
import { TaskService } from "../services/taskService.js";
import { DashboardService } from "../services/dashboardService.js";

export class TaskController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.query;
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
      const tasks = await TaskService.getAll(projectId as string, userCtx);
      res.json(tasks);
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
      const task = await TaskService.getById(id, userCtx);
      if (!task) {
        res
          .status(404)
          .json({ error: { message: "Task not found", status: 404 } });
        return;
      }
      res.json(task);
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
              message: "Forbidden: Teammates cannot create tasks.",
              status: 403,
            },
          });
        return;
      }
      const task = await TaskService.create(
        req.body,
        req.user?.organization_id || null,
      );
      if (req.user && task) {
        await DashboardService.logActivity(
          req.user.id,
          "created task",
          task.title,
          task.projectId,
        );
      }
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
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

      const existingTask = await TaskService.getById(id, userCtx);
      if (!existingTask) {
        res
          .status(404)
          .json({ error: { message: "Task not found", status: 404 } });
        return;
      }

      const task = await TaskService.update(id, req.body);
      if (req.user && task) {
        const action =
          req.body.status && req.body.status !== existingTask.status
            ? `moved task to ${req.body.status.replace("_", " ")}`
            : "updated task";
        await DashboardService.logActivity(
          req.user.id,
          action,
          task.title,
          task.projectId,
        );
      }
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
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

      const existingTask = await TaskService.getById(id, userCtx);
      if (!existingTask) {
        res
          .status(404)
          .json({ error: { message: "Task not found", status: 404 } });
        return;
      }

      const task = await TaskService.delete(id);
      if (req.user && existingTask) {
        await DashboardService.logActivity(
          req.user.id,
          "deleted task",
          existingTask.title,
          existingTask.projectId,
        );
      }
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message, status: 400 } });
    }
  }
}
