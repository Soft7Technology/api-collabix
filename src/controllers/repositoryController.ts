import { Request, Response, NextFunction } from "express";
import { RepositoryService } from "../services/repositoryService.js";
import { GithubService } from "../services/githubService.js";
import { db } from "../db/index.js";

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
      const branch = req.query.branch as string | undefined;
      const userId = req.user?.id;
      const data = await RepositoryService.getDashboard(id, orgId!, branch, userId);
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
      const userId = req.user?.id;
      const branches = await RepositoryService.getBranches(id, userId);
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
      const userId = req.user?.id;
      const branch = req.query.branch as string | undefined;
      const commits = await RepositoryService.getCommits(id, userId, branch);
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
      const { repoId } = req.params;
      const path = (req.query.path as string) || "";
      const branch = (req.query.branch as string) || undefined;
      const userId = req.user?.id;

      const { rows: repoRows } = await db.query(
        "SELECT github_owner, github_repo_name, repo_url, default_branch FROM repositories WHERE id = $1 LIMIT 1;",
        [repoId]
      );
      const repo = repoRows[0];
      if (!repo) {
        res.status(404).json({ error: { message: "Repository not found.", status: 404 } });
        return;
      }

      let owner = repo.github_owner;
      let repoName = repo.github_repo_name;
      if ((!owner || !repoName) && repo.repo_url) {
        const match = repo.repo_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
        if (match) {
          owner = match[1];
          repoName = match[2];
        }
      }

      let token: string | null = null;
      if (userId) {
        const { rows: userRows } = await db.query(
          "SELECT github_token FROM users WHERE id = $1 LIMIT 1;",
          [userId]
        );
        token = userRows[0]?.github_token || null;
      }

      if (owner && repoName) {
        const contents = await GithubService.getRepoContents(token, owner, repoName, path, branch || repo.default_branch);
        if (contents && contents.length > 0) {
          res.json(contents);
          return;
        }
      }

      res.json([]);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:repoId/readme
   */
  public static async getReadme(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const branch = (req.query.branch as string) || undefined;
      const userId = req.user?.id;

      const { rows: repoRows } = await db.query(
        "SELECT name, github_owner, github_repo_name, repo_url, default_branch FROM repositories WHERE id = $1 LIMIT 1;",
        [repoId]
      );
      const repo = repoRows[0];
      if (!repo) {
        res.status(404).json({ error: { message: "Repository not found.", status: 404 } });
        return;
      }

      let owner = repo.github_owner;
      let repoName = repo.github_repo_name;
      if ((!owner || !repoName) && repo.repo_url) {
        const match = repo.repo_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
        if (match) {
          owner = match[1];
          repoName = match[2];
        }
      }

      let token: string | null = null;
      if (userId) {
        const { rows: userRows } = await db.query(
          "SELECT github_token FROM users WHERE id = $1 LIMIT 1;",
          [userId]
        );
        token = userRows[0]?.github_token || null;
      }

      if (owner && repoName) {
        const content = await GithubService.getRepoReadme(token, owner, repoName, branch || repo.default_branch);
        if (content) {
          res.json({ content });
          return;
        }
      }

      res.json({ content: `# ${repo.name}\n\nRepository connected to Collabix.` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/repositories/:repoId/sync
   */
  public static async syncRepo(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const userId = req.user?.id;

      const branch = (req.query.branch as string) || (req.body?.branch as string) || undefined;
      const result = await RepositoryService.syncRepo(repoId, userId, branch);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/repositories/:repoId/file-content
   */
  public static async getFileContent(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const path = (req.query.path as string) || "";
      const branch = (req.query.branch as string) || undefined;
      const userId = req.user?.id;

      if (!path) {
        res.status(400).json({ error: { message: "File path is required.", status: 400 } });
        return;
      }

      const { rows: repoRows } = await db.query(
        "SELECT name, github_owner, github_repo_name, repo_url, default_branch FROM repositories WHERE id = $1 LIMIT 1;",
        [repoId]
      );
      const repo = repoRows[0];
      if (!repo) {
        res.status(404).json({ error: { message: "Repository not found.", status: 404 } });
        return;
      }

      let owner = repo.github_owner;
      let repoName = repo.github_repo_name;
      if ((!owner || !repoName) && repo.repo_url) {
        const match = repo.repo_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
        if (match) {
          owner = match[1];
          repoName = match[2];
        }
      }

      let token: string | null = null;
      if (userId) {
        const { rows: userRows } = await db.query(
          "SELECT github_token FROM users WHERE id = $1 LIMIT 1;",
          [userId]
        );
        token = userRows[0]?.github_token || null;
      }

      if (owner && repoName) {
        const fileResult = await GithubService.getFileContent(token, owner, repoName, path, branch || repo.default_branch);
        res.json({
          ...fileResult,
          path,
          name: path.split("/").pop(),
        });
        return;
      }

      res.status(404).json({ error: { message: "Repository is not linked to GitHub.", status: 404 } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/repositories/:repoId
   */
  public static async deleteRepository(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId } = req.params;
      const orgId = req.user?.organization_id;
      if (!orgId) {
        res.status(401).json({ error: { message: "Unauthorized", status: 401 } });
        return;
      }

      const result = await RepositoryService.delete(repoId, orgId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
