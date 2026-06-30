-- Migration 0002: Add Auth and RBAC

-- Ensure pgcrypto is enabled for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Roles Table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  rank INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed Default Roles
INSERT INTO roles (name, rank) VALUES
('Admin', 1),
('Manager', 2),
('Team leader', 3),
('Hr', 3),
('Teammates', 4)
ON CONFLICT (name) DO UPDATE SET rank = EXCLUDED.rank;

-- 2. Create Role Permissions Table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_name VARCHAR(100) NOT NULL,
  UNIQUE(role_id, permission_name)
);

-- Seed Role Permissions
INSERT INTO role_permissions (role_id, permission_name) VALUES
((SELECT id FROM roles WHERE name = 'Admin'), '*'),
((SELECT id FROM roles WHERE name = 'Manager'), 'project:read'),
((SELECT id FROM roles WHERE name = 'Manager'), 'task:read'),
((SELECT id FROM roles WHERE name = 'Manager'), 'task:update'),
((SELECT id FROM roles WHERE name = 'Manager'), 'admin:manage'),
((SELECT id FROM roles WHERE name = 'Team leader'), 'project:read'),
((SELECT id FROM roles WHERE name = 'Team leader'), 'task:read'),
((SELECT id FROM roles WHERE name = 'Team leader'), 'task:update'),
((SELECT id FROM roles WHERE name = 'Hr'), 'project:read'),
((SELECT id FROM roles WHERE name = 'Hr'), 'task:read'),
((SELECT id FROM roles WHERE name = 'Hr'), 'task:update'),
((SELECT id FROM roles WHERE name = 'Teammates'), 'project:read'),
((SELECT id FROM roles WHERE name = 'Teammates'), 'task:read'),
((SELECT id FROM roles WHERE name = 'Teammates'), 'task:update')
ON CONFLICT (role_id, permission_name) DO NOTHING;

-- 3. Create Departments Table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL
);

-- Seed Departments
INSERT INTO departments (name) VALUES
('Engineering'),
('Design'),
('Product'),
('Marketing'),
('Sales')
ON CONFLICT (name) DO NOTHING;

-- 4. Rename team_members Table to users
ALTER TABLE team_members RENAME TO users;

-- 5. Add Authentication & RBAC Columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 6. Map and Update Existing Seeded Users
-- Set all existing users to the 'Engineering' department
UPDATE users SET department_id = (SELECT id FROM departments WHERE name = 'Engineering');

-- Set Amelia Hart (u1) to 'Admin' and others to 'Teammates'
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Admin') WHERE id = 'u1';
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Teammates') WHERE id <> 'u1';

-- Make role_id NOT NULL now that it is fully populated
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;

-- 7. Add Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- 8. Create User Invitations Table
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitation_token_hash ON user_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_invitation_expires ON user_invitations(expires_at);

-- 9. Create Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 10. Drop task assignee foreign key constraint to support multiple assignees (comma-separated list or "all")
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
