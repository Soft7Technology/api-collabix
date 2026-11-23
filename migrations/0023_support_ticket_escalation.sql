-- Migration 0023: Add escalation tracking to support_tickets

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS escalated_to_super BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_by       VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_admins    TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_support_tickets_escalated
  ON support_tickets(escalated_to_super);
