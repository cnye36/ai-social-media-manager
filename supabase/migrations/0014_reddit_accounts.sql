-- Per-company Reddit OAuth (monitoring + reply posting)
create table reddit_accounts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade not null unique,
  reddit_username text not null,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  connected_at  timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table reddit_accounts enable row level security;

create policy "Owner read/write reddit_accounts" on reddit_accounts
  using (
    company_id in (select id from companies where owner_id = auth.uid())
  )
  with check (
    company_id in (select id from companies where owner_id = auth.uid())
  );

create trigger reddit_accounts_updated_at
  before update on reddit_accounts
  for each row execute function update_updated_at();
