-- Migration 0007: Add screen_logs table for screen monitoring
CREATE TABLE IF NOT EXISTS screen_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    screenshot_path VARCHAR(512) NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    display_width INTEGER,
    display_height INTEGER,
    status VARCHAR(50) DEFAULT 'active'
);

-- Index for querying user screen logs chronologically
CREATE INDEX IF NOT EXISTS idx_screen_logs_user_date ON screen_logs(user_id, captured_at DESC);
