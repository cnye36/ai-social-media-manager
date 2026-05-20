-- Content plans: monthly/weekly social calendars with AI-generated slots
create table content_plans (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete cascade not null,
  name                text not null,
  start_date          date not null,
  end_date            date not null,
  status              text not null default 'planned'
    check (status in ('planning', 'planned', 'writing', 'ready', 'archived')),
  channels            text[] not null default '{}',
  additional_context  text,
  strategy_summary    text,
  content_pillars     jsonb not null default '[]',
  posting_insights    jsonb not null default '{}',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index on content_plans (company_id, start_date desc);

create table content_plan_slots (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid references content_plans(id) on delete cascade not null,
  company_id      uuid references companies(id) on delete cascade not null,
  scheduled_for   timestamptz not null,
  channel         text not null check (channel in ('linkedin', 'x', 'reddit', 'facebook')),
  post_type       text not null,
  pillar          text,
  topic           text not null,
  content_goal    text not null default 'awareness'
    check (content_goal in ('awareness', 'engagement', 'promotion', 'education')),
  post_length     text not null default 'medium'
    check (post_length in ('short', 'medium', 'long')),
  notes           text,
  status          text not null default 'planned'
    check (status in ('planned', 'writing', 'written', 'skipped')),
  post_id         uuid references posts(id) on delete set null,
  sort_order      int not null default 0,
  created_at      timestamptz default now()
);

create index on content_plan_slots (plan_id, scheduled_for);
create index on content_plan_slots (company_id, status);

create trigger content_plans_updated_at
  before update on content_plans
  for each row execute function update_updated_at();

alter table content_plans enable row level security;
alter table content_plan_slots enable row level security;

create policy "content_plans_select" on content_plans
  for select using (company_id in (select owned_company_ids()));
create policy "content_plans_insert" on content_plans
  for insert with check (company_id in (select owned_company_ids()));
create policy "content_plans_update" on content_plans
  for update using (company_id in (select owned_company_ids()));
create policy "content_plans_delete" on content_plans
  for delete using (company_id in (select owned_company_ids()));

create policy "content_plan_slots_select" on content_plan_slots
  for select using (company_id in (select owned_company_ids()));
create policy "content_plan_slots_insert" on content_plan_slots
  for insert with check (company_id in (select owned_company_ids()));
create policy "content_plan_slots_update" on content_plan_slots
  for update using (company_id in (select owned_company_ids()));
create policy "content_plan_slots_delete" on content_plan_slots
  for delete using (company_id in (select owned_company_ids()));
