-- Track what topics agents search for in the knowledge base.
-- Used to surface gaps: topics searched frequently but not found.
CREATE TABLE IF NOT EXISTS rag_query_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  max_similarity FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rag_query_logs_company_created
  ON rag_query_logs (company_id, created_at DESC);

-- Auto-prune logs older than 90 days to keep the table lean
CREATE OR REPLACE FUNCTION prune_rag_query_logs() RETURNS void LANGUAGE sql AS $$
  DELETE FROM rag_query_logs WHERE created_at < NOW() - INTERVAL '90 days';
$$;
