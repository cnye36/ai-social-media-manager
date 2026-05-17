-- Enable RLS on all tables
alter table companies enable row level security;
alter table brand_profiles enable row level security;
alter table knowledge_chunks enable row level security;
alter table posts enable row level security;
alter table scrape_jobs enable row level security;

-- Helper: get company IDs owned by the current user
create or replace function owned_company_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select id from companies where owner_id = auth.uid()
$$;

-- Companies: owner only
create policy "owner_select" on companies for select using (owner_id = auth.uid());
create policy "owner_insert" on companies for insert with check (owner_id = auth.uid());
create policy "owner_update" on companies for update using (owner_id = auth.uid());
create policy "owner_delete" on companies for delete using (owner_id = auth.uid());

-- Brand profiles
create policy "brand_select" on brand_profiles for select using (company_id in (select owned_company_ids()));
create policy "brand_insert" on brand_profiles for insert with check (company_id in (select owned_company_ids()));
create policy "brand_update" on brand_profiles for update using (company_id in (select owned_company_ids()));
create policy "brand_delete" on brand_profiles for delete using (company_id in (select owned_company_ids()));

-- Knowledge chunks
create policy "knowledge_select" on knowledge_chunks for select using (company_id in (select owned_company_ids()));
create policy "knowledge_insert" on knowledge_chunks for insert with check (company_id in (select owned_company_ids()));
create policy "knowledge_delete" on knowledge_chunks for delete using (company_id in (select owned_company_ids()));

-- Posts
create policy "posts_select" on posts for select using (company_id in (select owned_company_ids()));
create policy "posts_insert" on posts for insert with check (company_id in (select owned_company_ids()));
create policy "posts_update" on posts for update using (company_id in (select owned_company_ids()));
create policy "posts_delete" on posts for delete using (company_id in (select owned_company_ids()));

-- Scrape jobs
create policy "scrape_select" on scrape_jobs for select using (company_id in (select owned_company_ids()));
create policy "scrape_insert" on scrape_jobs for insert with check (company_id in (select owned_company_ids()));
create policy "scrape_update" on scrape_jobs for update using (company_id in (select owned_company_ids()));
