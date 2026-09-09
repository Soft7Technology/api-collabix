-- Migration 0016: Add project_id to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS project_id VARCHAR REFERENCES projects(id) ON DELETE SET NULL;
