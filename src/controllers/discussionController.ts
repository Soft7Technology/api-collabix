import { Request, Response, NextFunction } from "express";
import { DiscussionService } from "../services/discussionService.js";

export class DiscussionController {
  static async getByProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.params;
      const orgId = req.user?.organization_id || null;
      const discussions = await DiscussionService.getByProject(projectId, orgId);
      res.json(discussions);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }
      const { projectId } = req.params;
      const { type, priority, title, description, assignedTo, attachments } = req.body;

      if (!title || !description) {
        res.status(400).json({ error: { message: "Title and description are required", status: 400 } });
        return;
      }

      const item = await DiscussionService.create(req.user.id, req.user.organization_id || null, {
        projectId,
        type,
        priority,
        title,
        description,
        assignedTo,
        attachments,
      });

      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  }

  static async getReplies(req: Request, res: Response, next: NextFunction) {
    try {
      const { discussionId } = req.params;
      const replies = await DiscussionService.getReplies(discussionId);
      res.json(replies);
    } catch (error) {
      next(error);
    }
  }

  static async addReply(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }
      const { discussionId } = req.params;
      const { content, attachments } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({ error: { message: "Reply content cannot be empty", status: 400 } });
        return;
      }

      const reply = await DiscussionService.addReply(req.user.id, {
        discussionId,
        content: content.trim(),
        attachments,
      });

      res.status(201).json(reply);
    } catch (error) {
      next(error);
    }
  }

  static async toggleResolve(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }
      const { id } = req.params;
      const result = await DiscussionService.toggleResolve(id, req.user.id);
      if (!result) {
        res.status(404).json({ error: { message: "Discussion not found", status: 404 } });
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }
      const { id } = req.params;
      const deleted = await DiscussionService.delete(id, req.user.id, req.user.is_super_admin || false);
      if (!deleted) {
        res.status(404).json({ error: { message: "Discussion not found or forbidden", status: 404 } });
        return;
      }
      res.json({ message: "Discussion deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}
