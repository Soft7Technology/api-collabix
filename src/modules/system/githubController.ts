import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { GithubService } from "../../services/githubService.js";
import { RepositoryService } from "../../services/repositoryService.js";
import { db } from "../../db/index.js";
import { config } from "../../config/index.js";
import { encryptToken, decryptToken } from "../../utils/crypto.js";

export class GithubController {
  /**
   * GET /api/github/auth-url
   * Initiates GitHub OAuth by generating authorization URL with cryptographically signed state token.
   */
  public static getAuthUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          error: {
            message: "Authentication is required to connect your GitHub account.",
            status: 401,
          },
        });
        return;
      }

      // Encode authenticated userId and nonce in signed JWT state token (15-minute expiry)
      const statePayload = {
        userId,
        nonce: crypto.randomBytes(16).toString("hex"),
        createdAt: Date.now(),
      };
      const state = jwt.sign(statePayload, config.JWT_ACCESS_SECRET, { expiresIn: "15m" });

      const url = GithubService.getAuthUrl(state);
      res.json({ url });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/github/callback
   * Exchanges authorization code for GitHub token, encrypts token with AES-256-GCM, and persists it.
   */
  public static async callback(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string | undefined;

      if (!code) {
        res.status(400).send("Authorization code is missing.");
        return;
      }

      let userId = req.user?.id;

      // If user session cookie is lost on cross-site redirect callback, recover userId from signed state parameter
      if (!userId && state) {
        try {
          const decoded = jwt.verify(state, config.JWT_ACCESS_SECRET) as { userId?: string };
          if (decoded && decoded.userId) {
            userId = decoded.userId;
          }
        } catch (stateErr: any) {
          console.warn("Invalid or expired OAuth state token:", stateErr.message);
        }
      }

      if (!userId) {
        res.status(401).send("Unauthorized session context. Please sign in to Collabix and retry connecting GitHub.");
        return;
      }

      // Verify that user still exists in database and is active
      const { rows: userRows } = await db.query(
        "SELECT id, status FROM users WHERE id = $1 LIMIT 1;",
        [userId]
      );
      if (!userRows[0] || userRows[0].status !== "ACTIVE") {
        res.status(401).send("User account not found or inactive.");
        return;
      }

      const { accessToken, githubUsername } = await GithubService.exchangeCode(code);

      // Encrypt sensitive GitHub access token with AES-256-GCM before database storage
      const encryptedToken = encryptToken(accessToken);

      // Save encrypted token in DB for the user
      await db.query(
        "UPDATE users SET github_token = $1, github_username = $2, updated_at = NOW() WHERE id = $3;",
        [encryptedToken, githubUsername, userId]
      );

      // Redirect the user back to the frontend dashboard or integrations page
      const frontendList = (config.FRONTEND_URL || "http://localhost:8001")
        .split(",")
        .map((u: string) => u.trim())
        .filter(Boolean);
      const isDev = config.NODE_ENV === "development";
      const clientUrl =
        (isDev ? frontendList.find((u: string) => u.includes("localhost:8001")) : frontendList[0]) ||
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
      const rawStoredToken = rows[0]?.github_token;
      const token = decryptToken(rawStoredToken);

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
   * Verifies GitHub X-Hub-Signature-256 HMAC header against configured webhook secret.
   */
  public static async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature = (req.headers["x-hub-signature-256"] as string) || "";
      const webhookSecret = config.GITHUB_WEBHOOK_SECRET;

      // Verify HMAC SHA-256 webhook signature if secret is configured or signature is provided
      if (webhookSecret) {
        if (!signature) {
          res.status(401).json({ error: "Unauthorized: Missing X-Hub-Signature-256 signature header." });
          return;
        }

        const rawPayload = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
        const expectedSignature = `sha256=${crypto
          .createHmac("sha256", webhookSecret)
          .update(rawPayload)
          .digest("hex")}`;

        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          res.status(401).json({ error: "Unauthorized: Invalid webhook signature verification." });
          return;
        }
      }

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