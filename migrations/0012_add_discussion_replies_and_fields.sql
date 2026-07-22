-- Migration 0012: Add assigned_to, resolved_at, resolved_by to project_discussions and create discussion_replies table

ALTER TABLE project_discussions ADD COLUMN IF NOT EXISTS assigned_to VARCHAR DEFAULT 'all';
ALTER TABLE project_discussions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE project_discussions ADD COLUMN IF NOT EXISTS resolved_by VARCHAR;

CREATE TABLE IF NOT EXISTS discussion_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID REFERENCES project_discussions(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
