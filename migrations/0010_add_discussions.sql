-- Migration 0010: Add project_discussions table for project communication, queries, error reporting & attachments
CREATE TABLE IF NOT EXISTS project_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'query', -- 'query', 'error', 'question'
  priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- array of { name, url, size, type }
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
