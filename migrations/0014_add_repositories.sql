-- Migration 0014: Add Git Repositories and GitHub Integration

-- 1. Alter users table to support GitHub OAuth integration
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_token VARCHAR(512) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username VARCHAR(255) DEFAULT NULL;

-- 2. Repositories Table
CREATE TABLE IF NOT EXISTS repositories (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  default_branch VARCHAR(100) DEFAULT 'main',
  visibility VARCHAR(50) DEFAULT 'private',
  repo_url VARCHAR(512) DEFAULT '',
  description TEXT DEFAULT '',
  build_status VARCHAR(50) DEFAULT 'Passing',
  github_owner VARCHAR(255) DEFAULT NULL,
  github_repo_name VARCHAR(255) DEFAULT NULL,
  webhook_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for organization and project filtering
CREATE INDEX IF NOT EXISTS idx_repositories_org_id ON repositories(organization_id);
CREATE INDEX IF NOT EXISTS idx_repositories_project_id ON repositories(project_id);

-- 3. Repository Branches Table
CREATE TABLE IF NOT EXISTS repository_branches (
  id VARCHAR PRIMARY KEY,
  repository_id VARCHAR NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  ahead_behind VARCHAR(50) DEFAULT '0 / 0',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(repository_id, name)
);

CREATE INDEX IF NOT EXISTS idx_branches_repo_id ON repository_branches(repository_id);

-- 4. Repository Commits Table
CREATE TABLE IF NOT EXISTS repository_commits (
  id VARCHAR PRIMARY KEY,
  repository_id VARCHAR NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  hash VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  branch VARCHAR(100) NOT NULL,
  task_id VARCHAR REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commits_repo_id ON repository_commits(repository_id);
CREATE INDEX IF NOT EXISTS idx_commits_task_id ON repository_commits(task_id);

-- 5. Repository Pull Requests Table
CREATE TABLE IF NOT EXISTS repository_pull_requests (
  id VARCHAR PRIMARY KEY,
  repository_id VARCHAR NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'merged', 'closed'
  source_branch VARCHAR(100) NOT NULL,
  target_branch VARCHAR(100) NOT NULL,
  task_id VARCHAR REFERENCES tasks(id) ON DELETE SET NULL,
  pr_number SERIAL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prs_repo_id ON repository_pull_requests(repository_id);
CREATE INDEX IF NOT EXISTS idx_prs_task_id ON repository_pull_requests(task_id);

-- 6. Repository Activity Table
CREATE TABLE IF NOT EXISTS repository_activity (
  id VARCHAR PRIMARY KEY,
  repository_id VARCHAR NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL, -- 'commit', 'branch_created', 'pr_created', 'pr_merged', etc.
  details VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_activity_repo_id ON repository_activity(repository_id);
