-- Migration 0003: Add Multi-Tenancy & SaaS Subscription Support

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(50),
  subscription_status VARCHAR(50) NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'expired'
  trial_ends_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '3 days',
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Alter users to add SaaS columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add organization_id to projects, tasks, sprints, meetings, leaves, activity_items
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sprints ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE activity_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 4. Seed Default Organization
INSERT INTO organizations (id, name, phone, subscription_status, trial_ends_at, is_approved)
VALUES (
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 
  'Delight Arts Studio', 
  '1-800-555-0199', 
  'active', 
  NOW() + INTERVAL '365 days', 
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 5. Associate existing records with the Default Organization
UPDATE users SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL AND is_super_admin = FALSE;
UPDATE projects SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL;
UPDATE tasks SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL;
UPDATE sprints SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL;
UPDATE meetings SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL;
UPDATE leaves SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL;
UPDATE activity_items SET organization_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0' WHERE organization_id IS NULL;

-- 6. Setup the Default User 'info@soft7.in' as Super Admin
UPDATE users 
SET is_super_admin = TRUE, organization_id = NULL 
WHERE email = 'info@soft7.in';

-- 7. Composite performance indexes for high multi-tenant volume
CREATE INDEX IF NOT EXISTS idx_tasks_org_created_at ON tasks (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects (organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_items_org_timestamp ON activity_items (organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sprints_org_id ON sprints (organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_org_id ON meetings (organization_id);
CREATE INDEX IF NOT EXISTS idx_leaves_org_id ON leaves (organization_id);
