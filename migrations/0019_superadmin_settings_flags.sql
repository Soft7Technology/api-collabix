-- Migration 0019: Add Super Admin Platform Settings, Feature Flags & Security Policies

-- 1. Feature Flags Table
CREATE TABLE IF NOT EXISTS system_feature_flags (
  id VARCHAR(50) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  sub VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed Default Feature Flags
INSERT INTO system_feature_flags (id, label, sub, enabled)
VALUES
  ('mon', 'Screen monitoring', 'Enable tracking module for all orgs', TRUE),
  ('kan', 'Kanban board', 'Drag-and-drop task board', TRUE),
  ('cal', 'Calendar sync', 'Two-way Google Calendar sync', FALSE),
  ('ai', 'AI task suggestions', 'Beta — auto-suggest task breakdowns', FALSE),
  ('brand', 'Custom branding', 'Org-level logo and color overrides', TRUE),
  ('api', 'API access', 'Public API and webhooks', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 2. Security Settings Table
CREATE TABLE IF NOT EXISTS system_security_settings (
  id VARCHAR(50) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  sub VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed Default Security Policies
INSERT INTO system_security_settings (id, label, sub, enabled)
VALUES
  ('2fa', 'Enforce 2FA for all org admins', 'Applies across every organization', TRUE),
  ('sso', 'Require SSO for Enterprise plan', 'Google Workspace / Okta / Azure AD', FALSE),
  ('ip', 'IP allow-listing', 'Restrict platform admin console by IP', FALSE),
  ('auto', 'Auto-suspend on repeated breach attempts', 'Lock org after 5 failed admin logins', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Platform Settings Table
CREATE TABLE IF NOT EXISTS system_platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed Default Platform Settings
INSERT INTO system_platform_settings (key, value)
VALUES
  ('platform_name', 'SOFT7'),
  ('support_email', 'support@soft7.in'),
  ('default_timezone', 'IST — Asia/Kolkata'),
  ('accent_color', '#3cdb73'),
  ('public_api_key', 'pk_live_51H8x9J2kL3mN4pQ5rS6tU7vW8xY0z1a2b3c4d5e6f7g8h9i'),
  ('webhook_secret', 'whsec_9F2b8K1L4mN7pQ0rS3tU6vW9xY2z5a8b1c4d7e0f3g6h9i2j')
ON CONFLICT (key) DO NOTHING;
