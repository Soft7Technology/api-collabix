-- Add can_create_tasks column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_create_tasks BOOLEAN DEFAULT FALSE;
