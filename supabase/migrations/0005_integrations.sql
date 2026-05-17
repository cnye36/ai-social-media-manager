-- OAuth token storage for third-party integrations (Canva, etc.)
create table user_integrations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  provider     text not null,                  -- 'canva'
  access_token text not null,
  refresh_token text,
  expires_at   timestamptz,
  scope        text,
  metadata     jsonb default '{}',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (user_id, provider)
);

alter table user_integrations enable row level security;

create policy "user_own_integrations" on user_integrations
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger integrations_updated_at
  before update on user_integrations
  for each row execute function update_updated_at();
