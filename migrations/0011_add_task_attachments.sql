-- Migration 0011: Add attachments column to tasks table for media uploads (images, videos, PDFs, documents)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
