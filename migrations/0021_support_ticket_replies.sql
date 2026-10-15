-- Migration: 0021_support_ticket_replies.sql
-- Create support_ticket_replies table for threaded ticket conversations

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id VARCHAR(64) PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  sender_name VARCHAR(255) NOT NULL,
  sender_role VARCHAR(64) DEFAULT 'Super Admin',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_id ON support_ticket_replies(ticket_id);
