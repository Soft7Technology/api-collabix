-- Migration 0019: Add incoming and schedule to subscription status for upgrade and downgrade flow
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending','active','paused','cancelled','expired','failed','incoming','scheduled'));

CREATE UNIQUE INDEX IF NOT EXISTS one_incoming_subscription_per_org
ON subscriptions (organization_id)
WHERE status IN ('incoming', 'scheduled');
