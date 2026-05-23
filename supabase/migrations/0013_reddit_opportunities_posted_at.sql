-- Store when the post was published on Reddit (not when we ingested it).
ALTER TABLE reddit_opportunities
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

UPDATE reddit_opportunities
SET posted_at = seen_at
WHERE posted_at IS NULL;

ALTER TABLE reddit_opportunities
  ALTER COLUMN posted_at SET NOT NULL,
  ALTER COLUMN posted_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_reddit_opportunities_company_posted_at
  ON reddit_opportunities (company_id, posted_at DESC);
