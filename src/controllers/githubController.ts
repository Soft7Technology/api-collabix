import { Request, Response, NextFunction } from "express";
import { GithubService } from "../services/githubService.js";
import { RepositoryService } from "../services/repositoryService.js";
import { db } from "../db/index.js";
import { config } from "../config/index.js";

export class GithubController {
  /**
   * GET /api/github/auth-url
   */
  public static getAuthUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const state = Math.random().toString(36).substring(2, 15);
      const url = GithubService.getAuthUrl(state);
      res.json({ url });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/github/callback
   */
  public static async callback(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).send("Authorization code is missing.");
        return;
      }

      // If user is not authenticated in Collabix session (e.g. Redirect Callback from GitHub)
      // we need to make sure we have access to req.user.
      // Usually, in a single-page-app, the callback happens on the frontend page,
      // which then makes a GET request to this backend callback endpoint with the code.
      // That way, the browser's credentials (access_token cookie) are sent, and req.user is populated!
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).send("Unauthorized session context. Please sign in to Collabix first.");
        return;
      }

      const { accessToken, githubUsername } = await GithubService.exchangeCode(code);

      // Save token in DB for the user
      await db.query(
        "UPDATE users SET github_token = $1, github_username = $2, updated_at = NOW() WHERE id = $3;",
        [accessToken, githubUsername, userId]
      );

      // Redirect the user back to the frontend dashboard or integrations page
      const frontendList = (config.FRONTEND_URL || "http://localhost:8001")
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      const isDev = config.NODE_ENV === "development";
      const clientUrl =
        (isDev ? frontendList.find((u) => u.includes("localhost:8001")) : frontendList[0]) ||
        frontendList[0] ||
        "http://localhost:8001";
      const redirectTarget = `${clientUrl}/code?github=connected`;
      res.redirect(redirectTarget);
    } catch (error: any) {
      console.error("GitHub OAuth callback error:", error.message);
      res.status(500).send(`GitHub connection failed: ${error.message}`);
    }
  }

  /**
   * GET /api/github/repos
   */
  public static async getRepos(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: { message: "Unauthorized.", status: 401 } });
        return;
      }

      // Fetch user's GitHub token
      const { rows } = await db.query("SELECT github_token FROM users WHERE id = $1 LIMIT 1;", [userId]);
      const token = rows[0]?.github_token;

      if (!token) {
        // If GITHUB_CLIENT_ID is not configured, automatically fallback to simulated repos
        if (!config.GITHUB_CLIENT_ID) {
          const repos = await GithubService.getUserRepos("mock_access_token");
          res.json(repos);
          return;
        }

        res.status(400).json({
          error: {
            message: "Your GitHub account is not connected. Please connect it first in Settings.",
            code: "GITHUB_NOT_CONNECTED",
            status: 400,
          },
        });
        return;
      }

      const repos = await GithubService.getUserRepos(token);
      res.json(repos);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/github/disconnect
   */
  public static async disconnect(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: { message: "Unauthorized.", status: 401 } });
        return;
      }

      await db.query(
        "UPDATE users SET github_token = NULL, github_username = NULL, updated_at = NOW() WHERE id = $1;",
        [userId]
      );

      res.json({ success: true, message: "GitHub account disconnected." });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/github/webhook
   */
  public static async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const gitHubEvent = req.headers["x-github-event"] as string;

      if (gitHubEvent === "ping") {
        res.json({ zen: "zen_success" });
        return;
      }

      const repository = req.body.repository;
      if (!repository) {
        res.status(400).json({ error: "Missing repository information in webhook payload." });
        return;
      }

      const owner = repository.owner.login || repository.owner.name;
      const repoName = repository.name;

      if (gitHubEvent === "push") {
        // Ref looks like "refs/heads/branch_name"
        const ref = req.body.ref || "";
        const branch = ref.replace("refs/heads/", "");

        const commits = req.body.commits || [];
        for (const commit of commits) {
          await RepositoryService.recordCommit({
            githubOwner: owner,
            githubRepoName: repoName,
            commitHash: commit.id?.substring(0, 7),
            message: commit.message,
            authorName: commit.author?.name || commit.author?.username,
            branch,
          });
        }

        res.json({ success: true, commitsSynced: commits.length });
        return;
      }

      if (gitHubEvent === "pull_request") {
        const action = req.body.action; // opened, closed, reopened, synchronize
        const prPayload = req.body.pull_request;
        const prNumber = prPayload.number;
        const title = prPayload.title;
        const description = prPayload.body || "";
        const sourceBranch = prPayload.head.ref;
        const targetBranch = prPayload.base.ref;
        const merged = prPayload.merged;

        // Find Repository in database
        const { rows: repos } = await db.query(
          "SELECT id FROM repositories WHERE LOWER(github_owner) = LOWER($1) AND LOWER(github_repo_name) = LOWER($2) LIMIT 1;",
          [owner, repoName]
        );
        const repo = repos[0];

        if (repo) {
          const repoId = repo.id;

          if (action === "opened" || action === "reopened" || action === "synchronize") {
            // Find task ID from PR title
            let taskId: string | null = null;
            const match = title.match(/(?:TASK-|#)([a-zA-Z0-9]+)/i);
            if (match && match[1]) {
              const parsedKey = match[1];
              const { rows: taskRows } = await db.query(
                "SELECT id FROM tasks WHERE id = $1 OR id = 't' || $2 LIMIT 1;",
                [parsedKey, parsedKey]
              );
              if (taskRows[0]) {
                taskId = taskRows[0].id;
              }
            }

            // Create or update PR
            const prId = `pr-${Date.now()}`;
            await db.query(
              `INSERT INTO repository_pull_requests (id, repository_id, title, description, status, source_branch, target_branch, task_id, pr_number)
               VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8)
               ON CONFLICT (id) DO UPDATE
               SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'open', updated_at = NOW();`,
              [prId, repoId, title, description, sourceBranch, targetBranch, taskId, prNumber]
            );
          } else if (action === "closed") {
            if (merged) {
              await RepositoryService.mergePullRequest(repoId, prNumber);
            } else {
              // PR closed without merging
              await db.query(
                "UPDATE repository_pull_requests SET status = 'closed', updated_at = NOW() WHERE repository_id = $1 AND pr_number = $2;",
                [repoId, prNumber]
              );
            }
          }
        }

        res.json({ success: true });
        return;
      }

      if (gitHubEvent === "create") {
        const refType = req.body.ref_type; // branch, tag
        const refName = req.body.ref;

        if (refType === "branch") {
          // Find repository
          const { rows: repos } = await db.query(
            "SELECT id FROM repositories WHERE LOWER(github_owner) = LOWER($1) AND LOWER(github_repo_name) = LOWER($2) LIMIT 1;",
            [owner, repoName]
          );
          const repo = repos[0];

          if (repo) {
            await RepositoryService.createBranch(repo.id, refName);
          }
        }

        res.json({ success: true });
        return;
      }

      res.json({ ignored: true });
    } catch (error: any) {
      console.error("GitHub webhook processing error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
}
