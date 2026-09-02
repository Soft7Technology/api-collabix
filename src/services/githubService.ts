import axios from "axios";
import { config } from "../config/index.js";

export interface GithubRepo {
  id: string;
  name: string;
  owner: string;
  url: string;
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
          description: "Next.js frontend application with TypeScript, Tailwind CSS, and shadcn UI",
        },
        {
          id: "repo-mock-2",
          name: "api-collabix-Backend",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/api-collabix.git",
          description: "Express Node.js REST API service with PostgreSQL database queries",
        },
        {
          id: "repo-mock-3",
          name: "Collabix-Mobile-App",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/collabix-mobile.git",
          description: "React Native mobile workspace client for iOS and Android",
        },
        {
          id: "repo-mock-4",
          name: "learning-typescript-patterns",
          owner: "Soft7Technology",
          url: "https://github.com/Soft7Technology/learning-typescript-patterns.git",
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
        owner: repo.owner.login,
        url: repo.html_url,
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
}
