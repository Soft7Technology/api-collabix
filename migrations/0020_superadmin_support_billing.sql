-- Migration 0020: Add Support Tickets and Invoices / Billing Tables

-- 1. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  priority VARCHAR(50) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 2. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL,
  amount VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'paid', -- 'paid', 'pending', 'failed'
  date VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

-- 3. Seed Initial Sample Support Tickets
INSERT INTO support_tickets (ticket_number, title, organization_id, status, priority, opened_at)
SELECT 
  'TICK-1001', 
  'Domain configuration assistance requested', 
  id, 
  'open', 
  'high', 
  NOW() - INTERVAL '2 days'
FROM organizations LIMIT 1
ON CONFLICT (ticket_number) DO NOTHING;

INSERT INTO support_tickets (ticket_number, title, organization_id, status, priority, opened_at)
SELECT 
  'TICK-1002', 
  'Bulk employee CSV import formatting issue', 
  id, 
  'open', 
  'medium', 
  NOW() - INTERVAL '5 days'
FROM organizations LIMIT 1
ON CONFLICT (ticket_number) DO NOTHING;

-- 4. Seed Initial Sample Invoices
INSERT INTO invoices (invoice_number, organization_id, plan, amount, status, date)
SELECT 
  'INV-2026-001', 
  id, 
  'Pro', 
  '₹450 /mo', 
  'paid', 
  'Mar 1, 2026'
FROM organizations LIMIT 1
ON CONFLICT (invoice_number) DO NOTHING;

INSERT INTO invoices (invoice_number, organization_id, plan, amount, status, date)
SELECT 
  'INV-2026-002', 
  id, 
  'Enterprise', 
  '₹330 /mo', 
  'paid', 
  'Feb 1, 2026'
FROM organizations LIMIT 1
ON CONFLICT (invoice_number) DO NOTHING;
