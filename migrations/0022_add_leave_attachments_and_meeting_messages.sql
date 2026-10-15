-- 0022_add_leave_attachments_and_meeting_messages.sql

-- Add attachment fields to leaves table
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Add logo_url to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create meeting_messages table for persistent in-meeting chat
CREATE TABLE IF NOT EXISTS meeting_messages (
  id VARCHAR(64) PRIMARY KEY,
  meeting_id VARCHAR(64) NOT NULL,
  sender_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_avatar_color VARCHAR(64),
  sender_initials VARCHAR(16),
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  organization_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting_id ON meeting_messages(meeting_id);
