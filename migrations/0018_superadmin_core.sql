-- Migration 0018: Add Super Admin Core Features (Plan column & System Audit Logs)

-- 1. Add plan column to organizations if not exists
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'Pro';

-- 2. Create system_audit_logs table
CREATE TABLE IF NOT EXISTS system_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL DEFAULT 'sys', -- 'sec', 'info', 'sys'
  message TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create indexes for efficient querying and log pagination
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON system_audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON system_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON system_audit_logs(organization_id);

-- 4. Seed initial system startup audit log entry if table is empty
INSERT INTO system_audit_logs (category, message)
SELECT 'sys', 'System audit trail initialized successfully.'
WHERE NOT EXISTS (SELECT 1 FROM system_audit_logs);
