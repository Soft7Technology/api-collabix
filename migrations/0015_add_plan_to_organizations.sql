-- Migration 0015: Add plan to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'Pro';
