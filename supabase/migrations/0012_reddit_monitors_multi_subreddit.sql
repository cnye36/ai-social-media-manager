-- Add multi-subreddit support to reddit_monitors.
-- Migrates the existing single `subreddit` text column to a `subreddits text[]` array,
-- and replaces the single `newest_seen_id` cursor with a per-subreddit `newest_seen_ids jsonb` map.

-- Step 1: add new columns
ALTER TABLE reddit_monitors
  ADD COLUMN IF NOT EXISTS subreddits   text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS newest_seen_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Step 2: back-fill from the old columns (safe even if subreddit is NULL)
UPDATE reddit_monitors
SET
  subreddits = CASE
    WHEN subreddit IS NOT NULL AND subreddit <> '' THEN ARRAY[subreddit]
    ELSE '{}'::text[]
  END,
  newest_seen_ids = CASE
    WHEN subreddit IS NOT NULL AND subreddit <> '' AND newest_seen_id IS NOT NULL
    THEN jsonb_build_object(subreddit, newest_seen_id)
    ELSE '{}'::jsonb
  END
WHERE subreddits = '{}';

-- Step 3: relax the NOT NULL on the legacy column so it doesn't block new inserts
-- that omit it (the app now writes subreddits[] as the source of truth).
ALTER TABLE reddit_monitors ALTER COLUMN subreddit DROP NOT NULL;

-- The application code now exclusively reads/writes subreddits + newest_seen_ids.
