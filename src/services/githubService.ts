import axios from "axios";
import { config } from "../config/index.js";

export interface GithubRepo {
  id: string;
  name: string;
  owner: string;
  url: string;
  cloneUrl?: string;
  description: string;
}

export class GithubService {
  /**
   * Generates the GitHub OAuth authorization URL.
   */
  public static getAuthUrl(state: string): string {
    const clientId = config.GITHUB_CLIENT_ID;
    if (!clientId) {
      // In simulated mode, redirect straight to frontend callback with mock code
      const redirectUri = config.GITHUB_REDIRECT_URI || `${config.FRONTEND_URL}/github/callback`;
      return `${redirectUri}?code=mock_code&state=${state}`;
    }

    const redirectUri = config.GITHUB_REDIRECT_URI || `${config.FRONTEND_URL}/github/callback`;
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=repo,admin:repo_hook&state=${state}&prompt=consent`;
  }

  /**
   * Exchanges authorization code for access token.
   */
  public static async exchangeCode(code: string): Promise<{ accessToken: string; githubUsername: string }> {
    const clientId = config.GITHUB_CLIENT_ID;
    const clientSecret = config.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret || code === "mock_code") {
      // Simulated Fallback
      return {
        accessToken: "mock_access_token_12345",
        githubUsername: "mock_github_developer",
      };
    }

    try {
      // 1. Exchange code for access token
      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      const accessToken = tokenRes.data.access_token;
      if (!accessToken) {
        throw new Error(tokenRes.data.error_description || "Failed to obtain access token from GitHub");
      }

      // 2. Fetch authenticated user profile to get username
      const userRes = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Collabix-App",
        },
      });

      return {
        accessToken,
        githubUsername: userRes.data.login,
      };
    } catch (err: any) {
      console.error("GitHub code exchange error:", err.message);
      throw new Error(`GitHub Authentication failed: ${err.message}`);
    }
  }

  /**
   * Retrieves the repositories list for the connected GitHub account.
   */
  public static async getUserRepos(token: string): Promise<GithubRepo[]> {
    if (token.startsWith("mock_access_token")) {
      // Simulated Fallback repositories
      return [
        {
          id: "repo-mock-1",
          name: "Collabix-Frontend",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/Collabix.git",
          cloneUrl: "https://github.com/Soft7Technology/Collabix.git",
          description: "Next.js frontend application with TypeScript, Tailwind CSS, and shadcn UI",
        },
        {
          id: "repo-mock-2",
          name: "api-collabix-Backend",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/api-collabix.git",
          cloneUrl: "https://github.com/Soft7Technology/api-collabix.git",
          description: "Express Node.js REST API service with PostgreSQL database queries",
        },
        {
          id: "repo-mock-3",
          name: "Collabix-Mobile-App",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/collabix-mobile.git",
          cloneUrl: "https://github.com/Soft7Technology/collabix-mobile.git",
          description: "React Native mobile workspace client for iOS and Android",
        },
        {
          id: "repo-mock-4",
          name: "learning-typescript-patterns",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/learning-typescript-patterns.git",
          cloneUrl: "https://github.com/Soft7Technology/learning-typescript-patterns.git",
          description: "A sandbox repository for learning core TypeScript structural design patterns",
        }
      ];
    }

    try {
      const res = await axios.get("https://api.github.com/user/repos?per_page=100&sort=updated", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Collabix-App",
        },
      });

      return res.data.map((repo: any) => ({
        id: String(repo.id),
        name: repo.name,
        owner: repo.owner?.login || repo.owner?.name || "User",
        url: repo.html_url || repo.url || "",
        cloneUrl: repo.clone_url || repo.html_url || repo.url || "",
        description: repo.description || "",
      }));
    } catch (err: any) {
      console.error("GitHub fetch user repos error:", err.message);
      throw new Error(`Failed to fetch repositories from GitHub: ${err.message}`);
    }
  }

  /**
   * Registers a push & pull request webhook on the specified GitHub repository.
   */
  public static async createWebhook(
    token: string,
    owner: string,
    repo: string,
    backendUrl: string
  ): Promise<string> {
    if (token.startsWith("mock_access_token")) {
      return `mock_hook_${Date.now()}`;
    }

    try {
      const webhookUrl = `${backendUrl}/api/github/webhook`;

      const hookRes = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/hooks`,
        {
          name: "web",
          active: true,
          events: ["push", "pull_request", "create"],
          config: {
            url: webhookUrl,
            content_type: "json",
            insecure_ssl: "0",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Collabix-App",
          },
        }
      );

      return String(hookRes.data.id);
    } catch (err: any) {
      // If hook already exists, ignore error and return a dummy webhook ID
      if (err.response?.status === 422) {
        console.warn(`Webhook already exists for ${owner}/${repo}. Proceeding.`);
        return `existing_hook_${Date.now()}`;
      }
      console.error(`Failed to create webhook on GitHub repository ${owner}/${repo}:`, err.message);
      throw new Error(`Failed to register webhook on GitHub repository: ${err.message}`);
    }
  }

  /**
   * Fetches real branches from GitHub repository.
   */
  public static async getRepoBranches(token: string | null, owner: string, repo: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Collabix-App",
      };
      if (token && !token.startsWith("mock_")) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches`, { headers });
      return res.data.map((b: any) => ({
        name: b.name,
        isDefault: b.name === "main" || b.name === "master",
        aheadBehind: "0 / 0",
        commitHash: b.commit?.sha?.substring(0, 7),
      }));
    } catch (err: any) {
      console.warn(`Failed to fetch branches for ${owner}/${repo}:`, err.message);
      return [];
    }
  }

  /**
   * Fetches real commits from GitHub repository.
   */
  public static async getRepoCommits(token: string | null, owner: string, repo: string, branch?: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Collabix-App",
      };
      if (token && !token.startsWith("mock_")) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const url = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100${branch ? `&sha=${branch}` : ""}`;
      const res = await axios.get(url, { headers });
      return res.data.map((c: any) => ({
        hash: c.sha.substring(0, 7),
        fullHash: c.sha,
        message: c.commit?.message?.split("\n")[0] || "Git commit",
        authorName: c.commit?.author?.name || c.author?.login || "Developer",
        date: c.commit?.author?.date || new Date().toISOString(),
        branch: branch || "main",
      }));
    } catch (err: any) {
      console.warn(`Failed to fetch commits for ${owner}/${repo}:`, err.message);
      return [];
    }
  }

  /**
   * Fetches real pull requests from GitHub repository.
   */
  public static async getRepoPullRequests(token: string | null, owner: string, repo: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Collabix-App",
      };
      if (token && !token.startsWith("mock_")) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=30`, { headers });
      return res.data.map((pr: any) => ({
        id: String(pr.number),
        title: pr.title,
        status: pr.state === "closed" ? (pr.merged_at ? "MERGED" : "CLOSED") : "OPEN",
        sourceBranch: pr.head?.ref || "branch",
        targetBranch: pr.base?.ref || "main",
        authorName: pr.user?.login || "Developer",
        authorAvatar: pr.user?.avatar_url,
        createdAt: pr.created_at,
        reviewers: pr.requested_reviewers?.map((r: any) => r.login) || [],
      }));
    } catch (err: any) {
      console.warn(`Failed to fetch pull requests for ${owner}/${repo}:`, err.message);
      return [];
    }
  }

  /**
   * Fetches real directory contents / files from GitHub repository.
   */
  public static async getRepoContents(token: string | null, owner: string, repo: string, path = "", branch?: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Collabix-App",
      };
      if (token && !token.startsWith("mock_")) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}${branch ? `?ref=${branch}` : ""}`;
      const res = await axios.get(url, { headers });

      if (Array.isArray(res.data)) {
        return res.data.map((item: any) => ({
          name: item.name,
          type: item.type === "dir" ? "folder" : "file",
          path: item.path,
          size: item.size ? `${(item.size / 1024).toFixed(1)} KB` : undefined,
          downloadUrl: item.download_url,
        }));
      } else {
        return [{
          name: res.data.name,
          type: "file",
          path: res.data.path,
          size: `${(res.data.size / 1024).toFixed(1)} KB`,
          content: res.data.content ? Buffer.from(res.data.content, "base64").toString("utf-8") : undefined,
          downloadUrl: res.data.download_url,
        }];
      }
    } catch (err: any) {
      console.warn(`Failed to fetch contents for ${owner}/${repo}/${path}:`, err.message);
      return [];
    }
  }

  /**
   * Fetches real raw content or binary data of a specific file from GitHub repository.
   */
  public static async getFileContent(token: string | null, owner: string, repo: string, path: string, branch?: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Collabix-App",
      };
      if (token && !token.startsWith("mock_")) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}${branch ? `?ref=${branch}` : ""}`;
      const res = await axios.get(url, { headers });

      const ext = path.split(".").pop()?.toLowerCase() || "";
      const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"].includes(ext);

      if (isImage) {
        if (res.data?.content) {
          const mimeType = ext === "svg" ? "image/svg+xml" : ext === "ico" ? "image/x-icon" : `image/${ext}`;
          const cleanBase64 = res.data.content.replace(/\n/g, "");
          return {
            isImage: true,
            mimeType,
            dataUrl: `data:${mimeType};base64,${cleanBase64}`,
            downloadUrl: res.data.download_url,
            size: res.data.size,
          };
        }
        if (res.data?.download_url) {
          return {
            isImage: true,
            mimeType: `image/${ext}`,
            dataUrl: res.data.download_url,
            downloadUrl: res.data.download_url,
            size: res.data.size,
          };
        }
      }

      if (res.data?.content) {
        const text = Buffer.from(res.data.content, "base64").toString("utf-8");
        return {
          isImage: false,
          content: text,
          downloadUrl: res.data.download_url,
          size: res.data.size,
        };
      }

      if (res.data?.download_url) {
        const rawRes = await axios.get(res.data.download_url);
        const text = typeof rawRes.data === "string" ? rawRes.data : JSON.stringify(rawRes.data, null, 2);
        return {
          isImage: false,
          content: text,
          downloadUrl: res.data.download_url,
          size: res.data.size,
        };
      }

      return { isImage: false, content: "" };
    } catch (err: any) {
      console.warn(`Failed to fetch file content for ${owner}/${repo}/${path}:`, err.message);
      return { isImage: false, content: `// Error loading file from GitHub: ${err.message}` };
    }
  }

  /**
   * Fetches real README from GitHub repository.
   */
  public static async getRepoReadme(token: string | null, owner: string, repo: string, branch?: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Collabix-App",
      };
      if (token && !token.startsWith("mock_")) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const url = `https://api.github.com/repos/${owner}/${repo}/readme${branch ? `?ref=${branch}` : ""}`;
      const res = await axios.get(url, { headers });
      if (res.data?.content) {
        return Buffer.from(res.data.content, "base64").toString("utf-8");
      }
      return null;
    } catch (err: any) {
      console.warn(`Failed to fetch README for ${owner}/${repo}:`, err.message);
      return null;
    }
  }
}
