import { Request, Response, NextFunction } from "express";
import { RepositoryService } from "../services/repositoryService.js";

export class RepositoryController {
  /**
   * GET /api/repositories
   */
  public static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user?.organization_id;
      if (!orgId) {
        res.status(400).json({ error: { message: "User is not associated with an organization.", status: 400 } });
        return;
      }

      const projectId = req.query.projectId as string | undefined;
      const repos = await RepositoryService.getAll(orgId, projectId);
      res.json(repos);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/repositories
   */
  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user?.organization_id;
      const userId = req.user?.id;

      if (!orgId || !userId) {
        res.status(400).json({ error: { message: "Invalid session context.", status: 400 } });
        return;
      }

      // Check permissions: Teammates (role_rank > 3) cannot create repositories
      if (req.user?.role_rank !== undefined && req.user.role_rank > 3) {
        res.status(403).json({
          error: {
            message: "Forbidden: Teammates do not have permission to connect repositories.",
            status: 403,
          },
        });
        return;
      }

      const repo = await RepositoryService.create(req.body, orgId, userId);
      res.status(201).json(repo);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:id/dashboard
   */
  public static async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user?.organization_id;
      if (!orgId) {
        res.status(400).json({ error: { message: "User is not associated with an organization.", status: 400 } });
        return;
      }

      const { id } = req.params;
      const data = await RepositoryService.getDashboard(id, orgId);
      if (!data) {
        res.status(404).json({ error: { message: "Repository not found.", status: 404 } });
        return;
      }

      res.json(data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:id/branches
   */
  public static async getBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const branches = await RepositoryService.getBranches(id);
      res.json(branches);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:id/commits
   */
  public static async getCommits(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const commits = await RepositoryService.getCommits(id);
      res.json(commits);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/repositories/commits
   */
  public static async recordCommit(req: Request, res: Response, next: NextFunction) {
    try {
      const commit = await RepositoryService.recordCommit(req.body);
      res.status(201).json(commit);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tasks/:taskId/development
   */
  public static async getTaskDevelopment(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user?.organization_id;
      if (!orgId) {
        res.status(400).json({ error: { message: "User is not associated with an organization.", status: 400 } });
        return;
      }

      const { taskId } = req.params;
      const devData = await RepositoryService.getTaskDevelopment(taskId, orgId);
      res.json(devData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:repoId/pull-requests
   */
  public static async getPullRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const status = req.query.status as string | undefined;
      const prs = await RepositoryService.getPullRequests(repoId, status);
      res.json(prs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/repositories/:repoId/pull-requests
   */
  public static async createPullRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user?.organization_id;
      const userId = req.user?.id;

      if (!orgId || !userId) {
        res.status(400).json({ error: { message: "Invalid session context.", status: 400 } });
        return;
      }

      const { repoId } = req.params;
      const prInput = { ...req.body, repoId };

      const pr = await RepositoryService.createPullRequest(prInput, userId, orgId);
      res.status(201).json(pr);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/repositories/:repoId/branches
   */
  public static async createBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const { name, targetBranch } = req.body;
      const userId = req.user?.id;

      const branch = await RepositoryService.createBranch(repoId, name, targetBranch, userId);
      res.status(201).json(branch);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:repoId/activity
   */
  public static async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const activity = await RepositoryService.getActivity(repoId);
      res.json(activity);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:repoId/files
   */
  public static async getFiles(req: Request, res: Response, next: NextFunction) {
    try {
      // Returns a standard layout representing the repository directory tree.
      // The frontend uses local DEFAULT_FILES mostly, but we support the endpoint.
      res.json([
        { name: "src", type: "folder", path: "src", lastCommitMessage: "Fix login validation & auth state", updatedAt: "2 hours ago" },
        { name: "components", type: "folder", path: "components", lastCommitMessage: "Update dashboard UI & sprint module", updatedAt: "5 hours ago" },
        { name: "public", type: "folder", path: "public", lastCommitMessage: "Add application branding assets", updatedAt: "1 day ago" },
        { name: "package.json", type: "file", path: "package.json", lastCommitMessage: "Update dependencies to latest versions", updatedAt: "1 day ago", size: "2.4 KB" },
        { name: "README.md", type: "file", path: "README.md", lastCommitMessage: "Update system documentation & quickstart guide", updatedAt: "2 days ago", size: "3.8 KB" },
        { name: "tsconfig.json", type: "file", path: "tsconfig.json", lastCommitMessage: "Configure strict TypeScript rules", updatedAt: "3 days ago", size: "1.1 KB" },
      ]);
    } catch (error) {
      next(error);
    }
  }
}
