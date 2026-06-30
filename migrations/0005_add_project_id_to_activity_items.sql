-- Migration 0005: Add project_id to activity_items
ALTER TABLE activity_items ADD COLUMN IF NOT EXISTS project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE;
