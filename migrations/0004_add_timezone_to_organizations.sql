-- Migration 0004: Add timezone to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'est';
