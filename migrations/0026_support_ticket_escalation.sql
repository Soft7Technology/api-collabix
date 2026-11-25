
-- Add explicit escalation state.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS escalated_to_super_admin BOOLEAN
  NOT NULL DEFAULT FALSE;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS escalated_by VARCHAR(64)
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_escalated
  ON support_tickets(escalated_to_super_admin);
