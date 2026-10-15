-- Migration 0017: Add Work Documentation Reports Table

CREATE TABLE IF NOT EXISTS work_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'weekly',
  period VARCHAR NOT NULL,
  start_date VARCHAR DEFAULT '',
  end_date VARCHAR DEFAULT '',
  project_id VARCHAR REFERENCES projects(id) ON DELETE SET NULL,
  project_name VARCHAR DEFAULT '',
  work_category VARCHAR(100) DEFAULT 'Development',
  summary TEXT DEFAULT '',
  tasks JSONB DEFAULT '[]'::jsonb,
  achievements JSONB DEFAULT '[]'::jsonb,
  challenges TEXT DEFAULT '',
  challenges_status VARCHAR(50) DEFAULT 'resolved',
  skills JSONB DEFAULT '[]'::jsonb,
  next_goals JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  daily_activities JSONB DEFAULT '[]'::jsonb,
  project_breakdowns JSONB DEFAULT '[]'::jsonb,
  timeline_milestones JSONB DEFAULT '[]'::jsonb,
  yearly_achievements JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  submitted_on VARCHAR DEFAULT '',
  manager_review JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performant filtering and sorting
CREATE INDEX IF NOT EXISTS idx_work_reports_org_id ON work_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_user_id ON work_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_type ON work_reports(type);
CREATE INDEX IF NOT EXISTS idx_work_reports_status ON work_reports(status);
CREATE INDEX IF NOT EXISTS idx_work_reports_created_at ON work_reports(created_at DESC);
