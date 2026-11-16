ALTER TABLE razorpay_webhook_events
ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255);

ALTER TABLE razorpay_webhook_events
ADD COLUMN IF NOT EXISTS event_created_at BIGINT;

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_subscription_timestamp
ON razorpay_webhook_events (subscription_id, event_created_at DESC)
WHERE status = 'processed';