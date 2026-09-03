import { db, pool } from "../db/index.js";
import { DashboardService } from "./dashboardService.js";
import { GithubService } from "./githubService.js";

export interface RepositoryInput {
  name: string;
  projectId: string;
  defaultBranch?: string;
  visibility?: string;
  repoUrl?: string;
  githubOwner?: string;
  githubRepoName?: string;
  webhookId?: string;
  description?: string;
}

export interface CommitInput {
  repoId?: string;
  commitHash?: string;
  message: string;
  authorName?: string;
  branch?: string;
  taskId?: string;
  githubOwner?: string;
  githubRepoName?: string;
}

export interface PRInput {
  repoId: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  taskId?: string;
  description?: string;
}

export class RepositoryService {
  /**
   * List repositories for an organization. Optional project filtering.
   */
  public static async getAll(organizationId: string, projectId?: string) {
    let queryStr = "SELECT * FROM repositories WHERE organization_id = $1";
    const params: any[] = [organizationId];

    if (projectId) {
      queryStr += " AND project_id = $2";
      params.push(projectId);
    }

    queryStr += " ORDER BY created_at DESC;";
    const { rows } = await db.query(queryStr, params);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      organizationId: r.organization_id,
      name: r.name,
      defaultBranch: r.default_branch,
      visibility: r.visibility,
      repoUrl: r.repo_url,
      description: r.description,
      buildStatus: r.build_status,
      githubOwner: r.github_owner,
      githubRepoName: r.github_repo_name,
      webhookId: r.webhook_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Get a repository by ID.
   */
  public static async getById(id: string, organizationId: string) {
    const { rows } = await db.query(
      "SELECT * FROM repositories WHERE id = $1 AND organization_id = $2;",
      [id, organizationId]
    );
    const r = rows[0];
    if (!r) return null;

    return {
      id: r.id,
      projectId: r.project_id,
      organizationId: r.organization_id,
      name: r.name,
      defaultBranch: r.default_branch,
      visibility: r.visibility,
      repoUrl: r.repo_url,
      description: r.description,
      buildStatus: r.build_status,
      githubOwner: r.github_owner,
      githubRepoName: r.github_repo_name,
      webhookId: r.webhook_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Create a new repository and register its default branch.
   */
  public static async create(repo: RepositoryInput, organizationId: string, userId: string) {
    const id = `repo-${Date.now()}`;
    const defaultBranch = repo.defaultBranch || "main";
    const visibility = repo.visibility || "private";

    let githubOwner = repo.githubOwner;
    let githubRepoName = repo.githubRepoName;
    if ((!githubOwner || !githubRepoName) && repo.repoUrl) {
      const match = repo.repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
      if (match) {
        githubOwner = match[1];
        githubRepoName = match[2];
      }
    }

    // Duplicate Prevention Check
    if (githubOwner && githubRepoName) {
      const { rows: existing } = await db.query(
        `SELECT id, name FROM repositories 
         WHERE organization_id = $1 
         AND LOWER(github_owner) = LOWER($2) 
         AND LOWER(github_repo_name) = LOWER($3)
         LIMIT 1;`,
        [organizationId, githubOwner, githubRepoName]
      );
      if (existing.length > 0) {
        throw new Error(`Repository "${githubOwner}/${githubRepoName}" is already connected to this workspace.`);
      }
    } else if (repo.repoUrl) {
      const { rows: existing } = await db.query(
        `SELECT id, name FROM repositories 
         WHERE organization_id = $1 AND repo_url = $2
         LIMIT 1;`,
        [organizationId, repo.repoUrl]
      );
      if (existing.length > 0) {
        throw new Error(`Repository with URL "${repo.repoUrl}" is already connected to this workspace.`);
      }
    } else {
      const { rows: existing } = await db.query(
        `SELECT id, name FROM repositories 
         WHERE organization_id = $1 AND project_id = $2 AND LOWER(name) = LOWER($3)
         LIMIT 1;`,
        [organizationId, repo.projectId, repo.name]
      );
      if (existing.length > 0) {
        throw new Error(`A repository named "${repo.name}" already exists in this project.`);
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 1. Insert repository record
      const { rows } = await client.query(
        `INSERT INTO repositories (id, project_id, organization_id, name, default_branch, visibility, repo_url, description, github_owner, github_repo_name, webhook_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *;`,
        [
          id,
          repo.projectId,
          organizationId,
          repo.name,
          defaultBranch,
          visibility,
          repo.repoUrl || "",
          repo.description || "",
          githubOwner || null,
          githubRepoName || null,
          repo.webhookId || null,
        ]
      );

      const createdRepo = rows[0];

      // Fetch user's name & token
      const { rows: userRows } = await client.query("SELECT name, github_token FROM users WHERE id = $1 LIMIT 1;", [userId]);
      const userName = userRows[0]?.name || "System";
      const githubToken = userRows[0]?.github_token || null;

      // 2. Sync branches from GitHub if connected
      let syncedBranches = false;
      if (githubOwner && githubRepoName) {
        const ghBranches = await GithubService.getRepoBranches(githubToken, githubOwner, githubRepoName);
        if (ghBranches.length > 0) {
          syncedBranches = true;
          for (const b of ghBranches) {
            const branchId = `br-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            await client.query(
              `INSERT INTO repository_branches (id, repository_id, name, is_default, ahead_behind)
               VALUES ($1, $2, $3, $4, $5);`,
              [branchId, id, b.name, b.name === defaultBranch || b.isDefault, b.aheadBehind || "0 / 0"]
            );
          }
        }
      }

      if (!syncedBranches) {
        const branchId = `br-${Date.now()}`;
        await client.query(
          `INSERT INTO repository_branches (id, repository_id, name, is_default, ahead_behind)
           VALUES ($1, $2, $3, $4, $5);`,
          [branchId, id, defaultBranch, true, "0 / 0"]
        );
      }

      // 3. Sync commits from GitHub if connected
      let syncedCommits = false;
      if (githubOwner && githubRepoName) {
        const ghCommits = await GithubService.getRepoCommits(githubToken, githubOwner, githubRepoName, defaultBranch);
        if (ghCommits.length > 0) {
          syncedCommits = true;
          for (const c of ghCommits) {
            const commitId = `commit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            await client.query(
              `INSERT INTO repository_commits (id, repository_id, hash, message, author_name, branch, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7);`,
              [commitId, id, c.hash, c.message, c.authorName, c.branch || defaultBranch, c.date]
            );
          }
        }
      }

      if (!syncedCommits) {
        const commitId = `commit-${Date.now()}`;
        const commitHash = Math.random().toString(16).substring(2, 9);
        await client.query(
          `INSERT INTO repository_commits (id, repository_id, hash, message, author_name, branch)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [commitId, id, commitHash, `Initial commit: Connected repository "${repo.name}"`, userName, defaultBranch]
        );
      }

      // 4. Sync PRs from GitHub if connected
      if (githubOwner && githubRepoName) {
        const ghPulls = await GithubService.getRepoPullRequests(githubToken, githubOwner, githubRepoName);
        for (const pr of ghPulls) {
          const prId = `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await client.query(
            `INSERT INTO repository_pull_requests (id, repository_id, title, status, source_branch, target_branch, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7);`,
            [prId, id, pr.title, pr.status.toLowerCase(), pr.sourceBranch, pr.targetBranch, pr.createdAt]
          );
        }
      }

      // 5. Log repository connection in specific repo activity feed
      const actId = `act-${Date.now()}`;
      await client.query(
        `INSERT INTO repository_activity (id, repository_id, user_id, action, details)
         VALUES ($1, $2, $3, $4, $5);`,
        [actId, id, userId, "repo_connected", `Connected repository "${repo.name}"`]
      );

      await client.query("COMMIT");

      // 4. Log in main feed
      await DashboardService.logActivity(userId, "connected repository", repo.name, repo.projectId);

      return {
        id: createdRepo.id,
        projectId: createdRepo.project_id,
        organizationId: createdRepo.organization_id,
        name: createdRepo.name,
        defaultBranch: createdRepo.default_branch,
        visibility: createdRepo.visibility,
        repoUrl: createdRepo.repo_url,
        description: createdRepo.description,
        buildStatus: createdRepo.build_status,
        githubOwner: createdRepo.github_owner,
        githubRepoName: createdRepo.github_repo_name,
        webhookId: createdRepo.webhook_id,
        createdAt: createdRepo.created_at,
        updatedAt: createdRepo.updated_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get Repository Dashboard info.
   */
  public static async getDashboard(repoId: string, organizationId: string, branch?: string, userId?: string) {
    const repo = await this.getById(repoId, organizationId);
    if (!repo) return null;

    let latestCommit: any = null;

    if (repo.githubOwner && repo.githubRepoName && userId) {
      let token: string | null = null;
      const { rows: userRows } = await db.query("SELECT github_token FROM users WHERE id = $1 LIMIT 1;", [userId]);
      token = userRows[0]?.github_token || null;
      const targetBranch = branch || repo.defaultBranch || "main";
      const liveCommits = await GithubService.getRepoCommits(token, repo.githubOwner, repo.githubRepoName, targetBranch);
      if (liveCommits.length > 0) {
        latestCommit = {
          commitHash: liveCommits[0].hash,
          message: liveCommits[0].message,
          authorName: liveCommits[0].authorName,
          createdAt: liveCommits[0].date,
        };
      }
    }

    if (!latestCommit) {
      let queryStr = `SELECT hash AS "commitHash", message, author_name AS "authorName", to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
                      FROM repository_commits
                      WHERE repository_id = $1`;
      const params: any[] = [repoId];
      if (branch) {
        queryStr += " AND (branch = $2 OR branch IS NULL)";
        params.push(branch);
      }
      queryStr += " ORDER BY created_at DESC LIMIT 1;";
      const { rows: commits } = await db.query(queryStr, params);
      latestCommit = commits[0] || null;
    }

    return {
      buildStatus: repo.buildStatus || "Passing",
      latestCommit,
    };
  }

  /**
   * Get Repository branches.
   */
  public static async getBranches(repoId: string, userId?: string) {
    const { rows } = await db.query(
      `SELECT name, is_default AS "isDefault", ahead_behind AS "aheadBehind"
       FROM repository_branches
       WHERE repository_id = $1
       ORDER BY is_default DESC, name ASC;`,
      [repoId]
    );

    // Auto-sync if 1 or 0 branches and linked to GitHub
    if (rows.length <= 1 && userId) {
      await this.syncRepo(repoId, userId);
      const { rows: refreshed } = await db.query(
        `SELECT name, is_default AS "isDefault", ahead_behind AS "aheadBehind"
         FROM repository_branches
         WHERE repository_id = $1
         ORDER BY is_default DESC, name ASC;`,
        [repoId]
      );
      if (refreshed.length > 0) return refreshed;
    }

    return rows;
  }

  /**
   * Get Repository commits.
   */
  public static async getCommits(repoId: string, userId?: string, branch?: string) {
    const { rows: repoRows } = await db.query(
      "SELECT github_owner, github_repo_name, default_branch FROM repositories WHERE id = $1 LIMIT 1;",
      [repoId]
    );
    const repo = repoRows[0];

    // If connected to GitHub, fetch live commits directly
    if (repo?.github_owner && repo?.github_repo_name && userId) {
      let token: string | null = null;
      const { rows: userRows } = await db.query("SELECT github_token FROM users WHERE id = $1 LIMIT 1;", [userId]);
      token = userRows[0]?.github_token || null;
      const targetBranch = branch || repo.default_branch || "main";
      const liveCommits = await GithubService.getRepoCommits(token, repo.github_owner, repo.github_repo_name, targetBranch);
      if (liveCommits.length > 0) {
        return liveCommits;
      }
    }

    let queryStr = `SELECT id, hash, message, author_name AS "authorName", created_at AS "date", branch, task_id AS "taskId"
                    FROM repository_commits
                    WHERE repository_id = $1`;
    const params: any[] = [repoId];
    if (branch) {
      queryStr += " AND (branch = $2 OR branch IS NULL)";
      params.push(branch);
    }
    queryStr += " ORDER BY created_at DESC;";
    const { rows } = await db.query(queryStr, params);

    return rows;
  }

  /**
   * Syncs latest branches, commits, and pull requests from GitHub for an existing repository.
   */
  public static async syncRepo(repoId: string, userId?: string, activeBranch?: string) {
    const { rows: repoRows } = await db.query("SELECT * FROM repositories WHERE id = $1 LIMIT 1;", [repoId]);
    const repo = repoRows[0];
    if (!repo) return null;

    let owner = repo.github_owner;
    let repoName = repo.github_repo_name;
    if ((!owner || !repoName) && repo.repo_url) {
      const match = repo.repo_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
      if (match) {
        owner = match[1];
        repoName = match[2];
        await db.query("UPDATE repositories SET github_owner = $1, github_repo_name = $2 WHERE id = $3;", [owner, repoName, repoId]);
      }
    }

    if (!owner || !repoName) {
      return { synced: false, message: "Not linked to a GitHub repository." };
    }

    let token: string | null = null;
    if (userId) {
      const { rows: userRows } = await db.query("SELECT github_token FROM users WHERE id = $1 LIMIT 1;", [userId]);
      token = userRows[0]?.github_token || null;
    }

    // 1. Sync Branches
    const ghBranches = await GithubService.getRepoBranches(token, owner, repoName);
    if (ghBranches.length > 0) {
      await db.query("DELETE FROM repository_branches WHERE repository_id = $1;", [repoId]);
      for (const b of ghBranches) {
        const branchId = `br-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await db.query(
          `INSERT INTO repository_branches (id, repository_id, name, is_default, ahead_behind)
           VALUES ($1, $2, $3, $4, $5);`,
          [branchId, repoId, b.name, b.name === (repo.default_branch || "main") || b.isDefault, b.aheadBehind || "0 / 0"]
        );
      }
    }

    // 2. Sync Commits for active branch, default branch, and other branches
    const branchesToSync = new Set<string>();
    if (activeBranch) branchesToSync.add(activeBranch);
    if (repo.default_branch) branchesToSync.add(repo.default_branch);
    ghBranches.forEach((b: any) => branchesToSync.add(b.name));

    await db.query("DELETE FROM repository_commits WHERE repository_id = $1;", [repoId]);

    let totalCommits = 0;
    for (const br of Array.from(branchesToSync)) {
      const ghCommits = await GithubService.getRepoCommits(token, owner, repoName, br);
      totalCommits += ghCommits.length;
      for (const c of ghCommits) {
        const commitId = `commit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await db.query(
          `INSERT INTO repository_commits (id, repository_id, hash, message, author_name, branch, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [commitId, repoId, c.hash, c.message, c.authorName, br, c.date]
        );
      }
    }

    // 3. Sync Pull Requests
    const ghPulls = await GithubService.getRepoPullRequests(token, owner, repoName);
    if (ghPulls.length > 0) {
      await db.query("DELETE FROM repository_pull_requests WHERE repository_id = $1;", [repoId]);
      for (const pr of ghPulls) {
        const prId = `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await db.query(
          `INSERT INTO repository_pull_requests (id, repository_id, title, status, source_branch, target_branch, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [prId, repoId, pr.title, pr.status.toLowerCase(), pr.sourceBranch, pr.targetBranch, pr.createdAt]
        );
      }
    }

    return {
      synced: true,
      branchesCount: ghBranches.length,
      commitsCount: totalCommits,
      pullsCount: ghPulls.length,
    };
  }

  /**
   * Creates a new branch record if it doesn't already exist.
   */
  public static async createBranch(repoId: string, branchName: string, targetBranch = "main", userId?: string) {
    const { rows: existing } = await db.query(
      "SELECT id FROM repository_branches WHERE repository_id = $1 AND name = $2;",
      [repoId, branchName]
    );

    if (existing.length > 0) return existing[0];

    const branchId = `br-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const isDefault = branchName === "main" || branchName === "master";

    await db.query(
      `INSERT INTO repository_branches (id, repository_id, name, is_default, ahead_behind)
       VALUES ($1, $2, $3, $4, $5);`,
      [branchId, repoId, branchName, isDefault, "1 ahead"]
    );

    // Log repo activity
    const actId = `act-${Date.now()}`;
    await db.query(
      `INSERT INTO repository_activity (id, repository_id, user_id, action, details)
       VALUES ($1, $2, $3, $4, $5);`,
      [actId, repoId, userId || null, "branch_created", `Created branch "${branchName}" from "${targetBranch}"`]
    );

    return { id: branchId, name: branchName, isDefault, aheadBehind: "1 ahead" };
  }

  /**
   * Record a Git commit, automatically parsing and linking to any matched tasks.
   */
  public static async recordCommit(commit: CommitInput) {
    let repoId = commit.repoId;

    // 1. If repoId not provided but owner/repo details are, find the repository record.
    if (!repoId && commit.githubOwner && commit.githubRepoName) {
      const { rows } = await db.query(
        "SELECT id FROM repositories WHERE LOWER(github_owner) = LOWER($1) AND LOWER(github_repo_name) = LOWER($2) LIMIT 1;",
        [commit.githubOwner, commit.githubRepoName]
      );
      if (rows[0]) {
        repoId = rows[0].id;
      }
    }

    if (!repoId) {
      throw new Error("Repository reference is required to record a commit.");
    }

    // 2. Fetch repository to get project and organization context
    const { rows: repos } = await db.query("SELECT * FROM repositories WHERE id = $1 LIMIT 1;", [repoId]);
    const repo = repos[0];
    if (!repo) throw new Error("Repository not found.");

    // 3. Generate commit details
    const hash = commit.commitHash || Math.random().toString(16).substring(2, 9);
    const branch = commit.branch || "main";
    const authorName = commit.authorName || "Git Developer";
    const message = commit.message;

    // 4. Smart auto-linking: Parse task ID from commit message
    let finalTaskId = commit.taskId || null;
    if (!finalTaskId) {
      // RegEx matches: TASK-142, TASK-t142, #142, #t142
      const match = message.match(/(?:TASK-|#)([a-zA-Z0-9]+)/i);
      if (match && match[1]) {
        const parsedKey = match[1];
        // Query to check if task exists
        const { rows: taskRows } = await db.query(
          "SELECT id FROM tasks WHERE id = $1 OR id = 't' || $2 LIMIT 1;",
          [parsedKey, parsedKey]
        );
        if (taskRows[0]) {
          finalTaskId = taskRows[0].id;
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 5. Ensure the branch exists
      const { rows: existingBranch } = await client.query(
        "SELECT id FROM repository_branches WHERE repository_id = $1 AND name = $2 LIMIT 1;",
        [repoId, branch]
      );
      if (existingBranch.length === 0) {
        const branchId = `br-${Date.now()}`;
        await client.query(
          `INSERT INTO repository_branches (id, repository_id, name, is_default, ahead_behind)
           VALUES ($1, $2, $3, $4, $5);`,
          [branchId, repoId, branch, false, "0 / 0"]
        );
      }

      // 6. Record commit
      const commitId = `commit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await client.query(
        `INSERT INTO repository_commits (id, repository_id, hash, message, author_name, branch, task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [commitId, repoId, hash, message, authorName, branch, finalTaskId]
      );

      // 7. Try mapping commit author to a user
      let matchedUserId: string | null = null;
      const { rows: userRows } = await client.query(
        "SELECT id FROM users WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1;",
        [authorName.trim(), authorName.toLowerCase().trim()]
      );
      if (userRows[0]) {
        matchedUserId = userRows[0].id;
      }

      // 8. Record repository action feed item
      const actId = `act-${Date.now()}`;
      await client.query(
        `INSERT INTO repository_activity (id, repository_id, user_id, action, details)
         VALUES ($1, $2, $3, $4, $5);`,
        [actId, repoId, matchedUserId, "commit", `Pushed commit [${hash}] on "${branch}": ${message}`]
      );

      await client.query("COMMIT");

      // 9. Log in main dashboard feed
      if (matchedUserId) {
        await DashboardService.logActivity(
          matchedUserId,
          `pushed commit [${hash}] on "${branch}"`,
          message.slice(0, 100),
          repo.project_id
        );
      }

      return {
        id: commitId,
        repoId,
        hash,
        message,
        authorName,
        branch,
        taskId: finalTaskId,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve development activity associated with a task.
   */
  public static async getTaskDevelopment(taskId: string, organizationId: string) {
    // 1. Verify task belongs to organization
    const { rows: tasks } = await db.query(
      "SELECT id, project_id FROM tasks WHERE id = $1 AND organization_id = $2 LIMIT 1;",
      [taskId, organizationId]
    );
    if (tasks.length === 0) {
      return { commitsCount: 0, commits: [], openPR: null, isMerged: false };
    }

    // 2. Fetch commits linked to task
    const { rows: commits } = await db.query(
      `SELECT c.hash, c.message, c.author_name AS "authorName", c.branch, c.created_at AS "createdAt"
       FROM repository_commits c
       JOIN repositories r ON c.repository_id = r.id
       WHERE c.task_id = $1 AND r.organization_id = $2
       ORDER BY c.created_at DESC;`,
      [taskId, organizationId]
    );

    // 3. Fetch PRs linked to task
    const { rows: prs } = await db.query(
      `SELECT pr.id, pr.pr_number AS "prNumber", pr.title, pr.status, pr.source_branch AS "sourceBranch", pr.target_branch AS "targetBranch", pr.created_at AS "createdAt"
       FROM repository_pull_requests pr
       JOIN repositories r ON pr.repository_id = r.id
       WHERE pr.task_id = $1 AND r.organization_id = $2
       ORDER BY pr.created_at DESC;`,
      [taskId, organizationId]
    );

    const openPR = prs.find((p) => p.status === "open") || null;
    const isMerged = prs.some((p) => p.status === "merged");

    return {
      commitsCount: commits.length,
      commits,
      openPR,
      isMerged,
    };
  }

  /**
   * Get Repository pull requests.
   */
  public static async getPullRequests(repoId: string, status?: string) {
    let queryStr = `SELECT id, pr_number AS "prNumber", title, description, status, source_branch AS "sourceBranch", target_branch AS "targetBranch", task_id AS "taskId", created_at AS "createdAt", updated_at AS "updatedAt"
                    FROM repository_pull_requests
                    WHERE repository_id = $1`;
    const params: any[] = [repoId];

    if (status) {
      queryStr += " AND status = $2";
      params.push(status);
    }

    queryStr += " ORDER BY created_at DESC;";
    const { rows } = await db.query(queryStr, params);
    return rows;
  }

  /**
   * Create a new Repository pull request.
   */
  public static async createPullRequest(pr: PRInput, userId: string, organizationId: string) {
    // Verify repository organization
    const { rows: repos } = await db.query(
      "SELECT id, project_id FROM repositories WHERE id = $1 AND organization_id = $2 LIMIT 1;",
      [pr.repoId, organizationId]
    );
    const repo = repos[0];
    if (!repo) throw new Error("Repository not found.");

    const id = `pr-${Date.now()}`;
    const status = "open";

    // Parse task ID from PR title if not explicitly provided
    let finalTaskId = pr.taskId || null;
    if (!finalTaskId) {
      const match = pr.title.match(/(?:TASK-|#)([a-zA-Z0-9]+)/i);
      if (match && match[1]) {
        const parsedKey = match[1];
        const { rows: taskRows } = await db.query(
          "SELECT id FROM tasks WHERE id = $1 OR id = 't' || $2 LIMIT 1;",
          [parsedKey, parsedKey]
        );
        if (taskRows[0]) {
          finalTaskId = taskRows[0].id;
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert Pull Request
      const { rows } = await client.query(
        `INSERT INTO repository_pull_requests (id, repository_id, title, description, status, source_branch, target_branch, task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *;`,
        [id, pr.repoId, pr.title, pr.description || "", status, pr.sourceBranch, pr.targetBranch, finalTaskId]
      );

      const createdPR = rows[0];

      // Log repository activity
      const actId = `act-${Date.now()}`;
      await client.query(
        `INSERT INTO repository_activity (id, repository_id, user_id, action, details)
         VALUES ($1, $2, $3, $4, $5);`,
        [actId, pr.repoId, userId, "pr_created", `Opened Pull Request #${createdPR.pr_number}: "${pr.title}"`]
      );

      await client.query("COMMIT");

      // Log in dashboard feed
      await DashboardService.logActivity(
        userId,
        `opened pull request #${createdPR.pr_number}`,
        pr.title,
        repo.project_id
      );

      return {
        id: createdPR.id,
        prNumber: createdPR.pr_number,
        title: createdPR.title,
        description: createdPR.description,
        status: createdPR.status,
        sourceBranch: createdPR.source_branch,
        targetBranch: createdPR.target_branch,
        taskId: createdPR.task_id,
        createdAt: createdPR.created_at,
        updatedAt: createdPR.updated_at,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Merge a pull request, updating its status in the database.
   */
  public static async mergePullRequest(repoId: string, prNumber: number, userId?: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get PR
      const { rows: prRows } = await client.query(
        `SELECT id, title, source_branch, target_branch, task_id
         FROM repository_pull_requests
         WHERE repository_id = $1 AND pr_number = $2 LIMIT 1;`,
        [repoId, prNumber]
      );
      const pr = prRows[0];
      if (!pr) throw new Error("Pull Request not found.");

      // Update PR status
      await client.query(
        `UPDATE repository_pull_requests
         SET status = 'merged', updated_at = NOW()
         WHERE repository_id = $1 AND pr_number = $2;`,
        [repoId, prNumber]
      );

      // Create a merge commit automatically
      const commitMsg = `Merge pull request #${prNumber} from ${pr.source_branch}`;
      const mergeCommitHash = Math.random().toString(16).substring(2, 9);
      const commitId = `commit-${Date.now()}`;
      await client.query(
        `INSERT INTO repository_commits (id, repository_id, hash, message, author_name, branch, task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [commitId, repoId, mergeCommitHash, commitMsg, "GitHub Merge", pr.target_branch, pr.task_id]
      );

      // Log repository activity
      const actId = `act-${Date.now()}`;
      await client.query(
        `INSERT INTO repository_activity (id, repository_id, user_id, action, details)
         VALUES ($1, $2, $3, $4, $5);`,
        [actId, repoId, userId || null, "pr_merged", `Merged Pull Request #${prNumber}: "${pr.title}"`]
      );

      // Link commit to task development too
      if (pr.task_id) {
        // We can optionally mark the task as under testing / done, but we'll leave it to workflow.
      }

      await client.query("COMMIT");

      // Fetch repo project ID for main logging
      const { rows: repos } = await db.query("SELECT project_id FROM repositories WHERE id = $1 LIMIT 1;", [repoId]);
      const projectId = repos[0]?.project_id || null;

      if (userId) {
        await DashboardService.logActivity(
          userId,
          `merged pull request #${prNumber}`,
          pr.title,
          projectId
        );
      }

      return { success: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get Repository activity feed log.
   */
  public static async getActivity(repoId: string) {
    const { rows } = await db.query(
      `SELECT ra.id, ra.action, ra.details, ra.created_at AS "createdAt",
              u.id AS "userId", u.name AS "userName", u.avatar_color AS "userAvatarColor", u.initials AS "userInitials"
       FROM repository_activity ra
       LEFT JOIN users u ON ra.user_id = u.id
       WHERE ra.repository_id = $1
       ORDER BY ra.created_at DESC;`,
      [repoId]
    );

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      createdAt: r.createdAt,
      user: r.userId
        ? {
            id: r.userId,
            name: r.userName,
            avatarColor: r.userAvatarColor,
            initials: r.userInitials,
          }
        : null,
    }));
  }

  /**
   * Disconnect and delete a repository and all associated branches/commits/PRs (cascaded).
   */
  public static async delete(repoId: string, organizationId: string) {
    const { rows: repoRows } = await db.query(
      "SELECT id, name FROM repositories WHERE id = $1 AND organization_id = $2 LIMIT 1;",
      [repoId, organizationId]
    );
    const repo = repoRows[0];
    if (!repo) {
      throw new Error("Repository not found or unauthorized.");
    }

    await db.query("DELETE FROM repositories WHERE id = $1;", [repoId]);
    return { success: true, message: `Repository "${repo.name}" has been disconnected.` };
  }
}
