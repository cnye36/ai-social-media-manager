create table articles (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade not null,
  title         text not null default '',
  body          text not null default '',
  excerpt       text,
  tags          text[] default '{}',
  status        text not null default 'draft'
                check (status in ('draft', 'scheduled', 'published', 'archived')),
  scheduled_for timestamptz,
  published_at  timestamptz,
  ai_generated  boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index on articles (company_id, status);
create index on articles (company_id, scheduled_for);

create trigger articles_updated_at
  before update on articles
  for each row execute function update_updated_at();

alter table articles enable row level security;

create policy "articles_select" on articles for select using (company_id in (select owned_company_ids()));
create policy "articles_insert" on articles for insert with check (company_id in (select owned_company_ids()));
create policy "articles_update" on articles for update using (company_id in (select owned_company_ids()));
create policy "articles_delete" on articles for delete using (company_id in (select owned_company_ids()));
