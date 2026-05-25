-- Per-subreddit posting guidance: what works, what to avoid, ban risks (beyond raw rules).
ALTER TABLE reddit_subreddit_configs
  ADD COLUMN IF NOT EXISTS posting_guidance text,
  ADD COLUMN IF NOT EXISTS posting_guidance_updated_at timestamptz;
