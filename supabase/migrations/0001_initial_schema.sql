-- Enable pgvector for RAG embeddings
create extension if not exists vector;

-- Companies
create table companies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  slug        text unique not null,
  website_url text,
  logo_url    text,
  created_at  timestamptz default now()
);

-- Brand profiles (one per company)
create table brand_profiles (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references companies(id) on delete cascade unique not null,
  tone             text default 'professional',
  voice_notes      text,
  target_audience  text,
  keywords         text[] default '{}',
  avoid_phrases    text[] default '{}',
  color_palette    jsonb default '{}',
  channel_overrides jsonb default '{}',
  updated_at       timestamptz default now()
);

-- RAG knowledge chunks with vector embeddings
create table knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade not null,
  source_type text not null check (source_type in ('website', 'manual')),
  source_url  text,
  title       text,
  content     text not null,
  embedding   vector(1536),
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

create index on knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index on knowledge_chunks (company_id);

-- Posts
create table posts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies(id) on delete cascade not null,
  channel            text not null check (channel in ('linkedin', 'x', 'reddit', 'facebook')),
  status             text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  content            text not null,
  content_variants   jsonb default '{}',
  scheduled_for      timestamptz,
  published_at       timestamptz,
  media_items        jsonb default '[]',
  generation_params  jsonb default '{}',
  ai_generated       boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index on posts (company_id, status);
create index on posts (company_id, scheduled_for);

-- Scrape jobs for async website ingestion
create table scrape_jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade not null,
  url           text not null,
  status        text default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  pages_scraped int default 0,
  error_message text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz default now()
);

-- Updated_at trigger for posts
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at
  before update on posts
  for each row execute function update_updated_at();

create trigger brand_profiles_updated_at
  before update on brand_profiles
  for each row execute function update_updated_at();
