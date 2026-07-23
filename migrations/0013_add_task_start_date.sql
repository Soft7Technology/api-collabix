-- Migration 0013: Add start_date and is_start_date_auto columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date VARCHAR;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_start_date_auto BOOLEAN DEFAULT FALSE;
