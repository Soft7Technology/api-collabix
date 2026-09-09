-- Migration 0015: Enhance Meetings and Meeting Attendees for Teams Integration

-- 1. Add rich fields to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'teams';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_link TEXT DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_code VARCHAR(100) DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS passcode VARCHAR(100) DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS host_id VARCHAR REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS team_department VARCHAR(100) DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS agenda JSONB DEFAULT '[]'::jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 30;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Asia/Kolkata';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'upcoming';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_url TEXT DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS project_id VARCHAR REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- 2. Add rich fields to meeting_attendees table
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'attendee';
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'invited';
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP;
ALTER TABLE meeting_attendees ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- 3. Update existing records if any
UPDATE meetings SET platform = 'teams' WHERE platform IS NULL;
UPDATE meetings SET status = 'upcoming' WHERE status IS NULL;
UPDATE meetings SET duration_minutes = 30 WHERE duration_minutes IS NULL;
UPDATE meetings SET agenda = '[]'::jsonb WHERE agenda IS NULL;
