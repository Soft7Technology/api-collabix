-- Add status and reason columns to leaves table
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'PENDING';
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS reason VARCHAR;
