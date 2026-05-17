-- RPC function for similarity search (enforces company_id scoping)
create or replace function search_knowledge(
  p_company_id  uuid,
  p_embedding   vector(1536),
  p_match_count int default 5,
  p_threshold   float default 0.75
)
returns table (
  id          uuid,
  title       text,
  content     text,
  source_url  text,
  source_type text,
  similarity  float
)
language sql
stable
as $$
  select
    id,
    title,
    content,
    source_url,
    source_type,
    1 - (embedding <=> p_embedding) as similarity
  from knowledge_chunks
  where
    company_id = p_company_id
    and 1 - (embedding <=> p_embedding) > p_threshold
  order by embedding <=> p_embedding
  limit p_match_count;
$$;
