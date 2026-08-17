import { Request, Response, NextFunction } from "express";
import { db } from "../../db/index.js";

export interface RepositoryItem {
  id: string;
  projectId: string;
  name: string;
  defaultBranch: string;
  visibility: "public" | "private";
  repoUrl: string;
  organizationId?: string | null;
  createdAt: string;
}

export interface CommitItem {
  id: string;
  repoId: string;
  commitHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  branch: string;
  taskId?: string | null;
  createdAt: string;
}

export interface PullRequestItem {
  id: string;
  repoId: string;
  prNumber: number;
  title: string;
  status: "open" | "merged" | "closed";
  author: string;
  taskId?: string | null;
  createdAt: string;
}

export interface DeploymentItem {
  id: string;
  repoId: string;
  environment: "Production" | "Staging" | "Preview";
  status: "Passed" | "Building" | "Failed";
  commitHash: string;
  deployedAt: string;
}

// In-memory fallback dataset for rich demo experience
let mockRepositories: RepositoryItem[] = [
  {
    id: "repo-1",
    projectId: "p1",
    name: "Collabix Frontend",
    defaultBranch: "main",
    visibility: "private",
    repoUrl: "https://github.com/Soft7Technology/Collabix.git",
    createdAt: "2026-08-01T10:00:00Z",
  },
  {
    id: "repo-2",
    projectId: "p1",
    name: "api-collabix Backend",
    defaultBranch: "main",
    visibility: "private",
    repoUrl: "https://github.com/Soft7Technology/api-collabix.git",
    createdAt: "2026-08-01T10:00:00Z",
  },
  {
    id: "repo-3",
    projectId: "p1",
    name: "Collabix Mobile App",
    defaultBranch: "main",
    visibility: "private",
    repoUrl: "https://github.com/Soft7Technology/collabix-mobile.git",
    createdAt: "2026-08-02T11:00:00Z",
  },
];

let mockBranches: Record<string, Array<{ name: string; isDefault: boolean; aheadBehind: string }>> = {
  "repo-1": [
    { name: "main", isDefault: true, aheadBehind: "0 / 0" },
    { name: "development", isDefault: false, aheadBehind: "3 ahead" },
    { name: "feature/login", isDefault: false, aheadBehind: "1 ahead" },
    { name: "feature/dashboard", isDefault: false, aheadBehind: "4 ahead" },
    { name: "bugfix/navbar", isDefault: false, aheadBehind: "2 ahead" },
  ],
  "repo-2": [
    { name: "main", isDefault: true, aheadBehind: "0 / 0" },
    { name: "development", isDefault: false, aheadBehind: "5 ahead" },
    { name: "feature/smtp-config", isDefault: false, aheadBehind: "2 ahead" },
    { name: "feature/webhooks", isDefault: false, aheadBehind: "1 ahead" },
  ],
};

let mockCommits: CommitItem[] = [
  {
    id: "c-101",
    repoId: "repo-1",
    commitHash: "7a9e3bc",
    message: "TASK-152 Create Sprint Module & Sprint List view",
    authorName: "Suhani",
    authorEmail: "suhani@collabix.io",
    branch: "development",
    taskId: "t1",
    createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
  },
  {
    id: "c-102",
    repoId: "repo-1",
    commitHash: "3f821d9",
    message: "TASK-152 Implement Sprint progress calculation & status badges",
    authorName: "Suhani",
    authorEmail: "suhani@collabix.io",
    branch: "development",
    taskId: "t1",
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },
  {
    id: "c-103",
    repoId: "repo-2",
    commitHash: "3ef38e9",
    message: "feat(system): add admin email and SMTP configuration API endpoints",
    authorName: "Suhani",
    authorEmail: "suhani@collabix.io",
    branch: "main",
    taskId: null,
    createdAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
  },
];

let mockPRs: PullRequestItem[] = [
  {
    id: "pr-1",
    repoId: "repo-1",
    prNumber: 42,
    title: "TASK-152 Create Sprint Module & Interactive Cards",
    status: "open",
    author: "Suhani",
    taskId: "t1",
    createdAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
  },
  {
    id: "pr-2",
    repoId: "repo-2",
    prNumber: 38,
    title: "feat(smtp): System SMTP settings management with test endpoint",
    status: "merged",
    author: "Suhani",
    taskId: null,
    createdAt: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
  },
];

let mockDeployments: DeploymentItem[] = [
  {
    id: "dep-1",
    repoId: "repo-1",
    environment: "Production",
    status: "Passed",
    commitHash: "7a9e3bc",
    deployedAt: new Date(Date.now() - 3600 * 1000 * 1).toISOString(),
  },
  {
    id: "dep-2",
    repoId: "repo-2",
    environment: "Production",
    status: "Passed",
    commitHash: "3ef38e9",
    deployedAt: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
  },
];

export class RepositoryController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { projectId } = req.query;
      try {
        let queryStr = "SELECT * FROM repositories";
        const params: any[] = [];
        if (projectId) {
          queryStr += " WHERE project_id = $1";
          params.push(projectId);
        }
        const { rows } = await db.query(queryStr, params);
        if (rows.length > 0) {
          return res.json(
            rows.map((r: any) => ({
              id: r.id,
              projectId: r.project_id,
              name: r.name,
              defaultBranch: r.default_branch || "main",
              visibility: r.visibility || "private",
              repoUrl: r.repo_url,
              createdAt: r.created_at,
            })),
          );
        }
      } catch (dbErr) {
        // Fallback if table not initialized yet
      }

      let result = mockRepositories;
      if (projectId && projectId !== "all") {
        result = mockRepositories.filter((r) => r.projectId === projectId);
      }
      return res.json(result);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, projectId, defaultBranch, visibility, repoUrl } = req.body;
      const newRepo: RepositoryItem = {
        id: `repo-${Date.now()}`,
        name: name || "New Repository",
        projectId: projectId || "p1",
        defaultBranch: defaultBranch || "main",
        visibility: visibility || "private",
        repoUrl: repoUrl || `https://github.com/org/${name?.toLowerCase().replace(/\s+/g, "-")}.git`,
        createdAt: new Date().toISOString(),
      };
      mockRepositories.unshift(newRepo);
      mockBranches[newRepo.id] = [{ name: newRepo.defaultBranch, isDefault: true, aheadBehind: "0 / 0" }];
      res.status(201).json(newRepo);
    } catch (error) {
      next(error);
    }
  }

  static async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const repo = mockRepositories.find((r) => r.id === id) || mockRepositories[0];
      const commits = mockCommits.filter((c) => c.repoId === repo.id);
      const prs = mockPRs.filter((p) => p.repoId === repo.id);
      const deployments = mockDeployments.filter((d) => d.repoId === repo.id);
      const branches = mockBranches[repo.id] || [
        { name: "main", isDefault: true, aheadBehind: "0 / 0" },
        { name: "development", isDefault: false, aheadBehind: "2 ahead" },
      ];

      const latestCommit = commits[0] || {
        id: "c-latest",
        commitHash: "7a9e3bc",
        message: "TASK-152 Create Sprint Module & Sprint List view",
        authorName: "Suhani",
        branch: repo.defaultBranch,
        createdAt: new Date().toISOString(),
      };

      const latestDeployment = deployments[0] || {
        environment: "Production",
        status: "Passed",
        deployedAt: new Date().toISOString(),
      };

      res.json({
        repository: repo,
        branches,
        latestCommit,
        latestDeployment,
        openPullRequestsCount: prs.filter((p) => p.status === "open").length,
        openIssuesCount: 3,
        buildStatus: "Passing",
        managerInsights: {
          createdBy: "Suhani (Lead Architect)",
          lastCommit: latestCommit.createdAt,
          updated: new Date().toISOString(),
          status: "On Track & CI Passing",
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getBranches(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const branches = mockBranches[id] || [
        { name: "main", isDefault: true, aheadBehind: "0 / 0" },
        { name: "development", isDefault: false, aheadBehind: "3 ahead" },
        { name: "feature/login", isDefault: false, aheadBehind: "1 ahead" },
      ];
      res.json(branches);
    } catch (error) {
      next(error);
    }
  }

  static async getCommits(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const commits = mockCommits.filter((c) => c.repoId === id);
      res.json(commits);
    } catch (error) {
      next(error);
    }
  }

  static async recordCommit(req: Request, res: Response, next: NextFunction) {
    try {
      const { repoId, commitHash, message, authorName, authorEmail, branch, taskId } = req.body;
      
      // Auto Smart Regex Detection for Jira/Collabix task linking (e.g. TASK-152 or #152)
      let autoTaskId = taskId || null;
      if (!autoTaskId && message) {
        const match = message.match(/(?:TASK-)?(\d+)/i);
        if (match && match[1]) {
          autoTaskId = match[1].startsWith("t") ? match[1] : `t${match[1]}`;
        }
      }

      const newCommit: CommitItem = {
        id: `c-${Date.now()}`,
        repoId: repoId || "repo-1",
        commitHash: commitHash || Math.random().toString(36).substring(2, 9),
        message: message || "Smart Git Commit",
        authorName: authorName || "Developer",
        authorEmail: authorEmail || "dev@collabix.io",
        branch: branch || "development",
        taskId: autoTaskId,
        createdAt: new Date().toISOString(),
      };

      mockCommits.unshift(newCommit);

      // If autoTaskId linked, create an associated mock PR and deployment if not exists
      if (autoTaskId) {
        const existingPR = mockPRs.find((p) => p.taskId === autoTaskId);
        if (!existingPR) {
          mockPRs.unshift({
            id: `pr-${Date.now()}`,
            repoId: newCommit.repoId,
            prNumber: Math.floor(Math.random() * 50) + 10,
            title: message,
            status: "open",
            author: authorName || "Developer",
            taskId: autoTaskId,
            createdAt: new Date().toISOString(),
          });
        }
      }

      res.status(201).json(newCommit);
    } catch (error) {
      next(error);
    }
  }

  static async getTaskDevelopment(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const linkedCommits = mockCommits.filter(
        (c) => c.taskId === taskId || c.message.toLowerCase().includes(`task-${taskId.replace("t", "")}`)
      );
      const linkedPRs = mockPRs.filter((p) => p.taskId === taskId);
      const latestDeployment = mockDeployments[0];

      res.json({
        taskId,
        commitsCount: linkedCommits.length || (taskId === "t1" || taskId === "142" ? 3 : 0),
        commits: linkedCommits.length > 0 ? linkedCommits : (taskId === "t1" || taskId === "142" ? mockCommits.slice(0, 2) : []),
        openPR: linkedPRs[0] || (taskId === "t1" || taskId === "142" ? mockPRs[0] : null),
        isMerged: linkedPRs.some((p) => p.status === "merged") || taskId === "t1",
        deploymentStatus: latestDeployment?.status === "Passed" ? "Deployment Completed" : "In Progress",
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPullRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.query;
      let prs = mockPRs.filter((p) => p.repoId === id || id === "repo-1");
      if (status && status !== "all") {
        prs = prs.filter((p) => p.status === status);
      }
      res.json(prs);
    } catch (error) {
      next(error);
    }
  }

  static async createPullRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { title, sourceBranch, targetBranch, taskId, description } = req.body;
      const newPR: PullRequestItem = {
        id: `pr-${Date.now()}`,
        repoId: id || "repo-1",
        prNumber: mockPRs.length + 25,
        title: title || "New Pull Request",
        status: "open",
        author: "Suhani",
        taskId: taskId || null,
        createdAt: new Date().toISOString(),
      };
      mockPRs.unshift(newPR);
      res.status(201).json(newPR);
    } catch (error) {
      next(error);
    }
  }

  static async createBranch(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, targetBranch } = req.body;
      const branchObj = { name: name || "new-branch", isDefault: false, aheadBehind: "1 ahead" };
      if (!mockBranches[id]) {
        mockBranches[id] = [{ name: "main", isDefault: true, aheadBehind: "0 / 0" }];
      }
      mockBranches[id].push(branchObj);
      res.status(201).json(branchObj);
    } catch (error) {
      next(error);
    }
  }

  static async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      res.json([
        {
          id: "act-1",
          repoId: id,
          type: "push",
          actorName: "Suhani Sharma",
          description: "Pushed 3 commits to feature/login",
          targetBranch: "feature/login",
          commitCount: 3,
          commitMessage: '"Fix login validation"',
          timestamp: "2 hours ago",
        },
        {
          id: "act-2",
          repoId: id,
          type: "create_pr",
          actorName: "Rahul Sharma",
          description: "Created pull request #24",
          prNumber: 24,
          prTitle: '"Update dashboard UI"',
          timestamp: "4 hours ago",
        },
        {
          id: "act-3",
          repoId: id,
          type: "merge_pr",
          actorName: "Aman",
          description: "Merged pull request #21",
          prNumber: 21,
          prTitle: '"Fix authentication issue"',
          timestamp: "Yesterday",
        },
      ]);
    } catch (error) {
      next(error);
    }
  }

  static async getFiles(req: Request, res: Response, next: NextFunction) {
    try {
      res.json([
        { name: "src", type: "folder", path: "src", lastCommitMessage: "Fix login validation", updatedAt: "2 hours ago" },
        { name: "components", type: "folder", path: "components", lastCommitMessage: "Update dashboard UI", updatedAt: "5 hours ago" },
        { name: "package.json", type: "file", path: "package.json", lastCommitMessage: "Update dependencies", updatedAt: "1 day ago", size: "2.4 KB" },
        { name: "README.md", type: "file", path: "README.md", lastCommitMessage: "Update documentation", updatedAt: "2 days ago", size: "3.8 KB" },
      ]);
    } catch (error) {
      next(error);
    }
  }
}

