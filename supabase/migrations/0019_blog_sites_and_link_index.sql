-- Blog sites, article publishing fields, and internal link index

create table if not exists blog_sites (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references companies(id) on delete cascade not null,
  name                  text not null,
  base_url              text not null,
  default_author        text,
  frontmatter_template  text not null default '',
  created_at            timestamptz default now()
);

create index if not exists blog_sites_company_id on blog_sites (company_id);

alter table articles
  add column if not exists slug text,
  add column if not exists excerpt text,
  add column if not exists tags text[] default '{}',
  add column if not exists categories text[] default '{}',
  add column if not exists site_id uuid references blog_sites(id) on delete set null,
  add column if not exists meta_title text,
  add column if not exists meta_description text,
  add column if not exists author text;

create table if not exists article_link_index (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade not null,
  article_id  uuid references articles(id) on delete cascade,
  slug        text not null,
  full_url    text not null,
  title       text not null,
  excerpt     text,
  tags        text[] default '{}',
  categories  text[] default '{}',
  updated_at  timestamptz default now(),
  unique (company_id, slug)
);

create index if not exists article_link_index_company_id on article_link_index (company_id);

alter table blog_sites enable row level security;
alter table article_link_index enable row level security;

create policy if not exists "blog_sites_select" on blog_sites for select
  using (company_id in (select owned_company_ids()));
create policy if not exists "blog_sites_insert" on blog_sites for insert
  with check (company_id in (select owned_company_ids()));
create policy if not exists "blog_sites_update" on blog_sites for update
  using (company_id in (select owned_company_ids()));
create policy if not exists "blog_sites_delete" on blog_sites for delete
  using (company_id in (select owned_company_ids()));

create policy if not exists "article_link_index_select" on article_link_index for select
  using (company_id in (select owned_company_ids()));
create policy if not exists "article_link_index_insert" on article_link_index for insert
  with check (company_id in (select owned_company_ids()));
create policy if not exists "article_link_index_update" on article_link_index for update
  using (company_id in (select owned_company_ids()));
create policy if not exists "article_link_index_delete" on article_link_index for delete
  using (company_id in (select owned_company_ids()));
