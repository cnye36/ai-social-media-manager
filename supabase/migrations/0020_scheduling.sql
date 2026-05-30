-- Buffer post ID on posts (proper column instead of buried in generation_params)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS buffer_post_id TEXT;

-- Migrate existing data
UPDATE posts
SET buffer_post_id = generation_params->>'buffer_post_id'
WHERE generation_params->>'buffer_post_id' IS NOT NULL
  AND buffer_post_id IS NULL;

-- Posting schedule slots per company/channel
CREATE TABLE IF NOT EXISTS channel_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('linkedin', 'x', 'facebook')),
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun 6=Sat
  hour         INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute       INTEGER NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  timezone     TEXT NOT NULL DEFAULT 'America/New_York',
  enabled      BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, channel, day_of_week, hour, minute)
);

ALTER TABLE channel_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read/write" ON channel_schedules
  USING  (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()));
