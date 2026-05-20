-- Per-company Buffer integration (access token + profile mappings)
create table buffer_integrations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade not null unique,
  access_token text not null,
  -- profiles: [{id, service, service_username, channel}]
  -- service: 'twitter'|'linkedin'|'facebook'
  -- channel: our Channel type ('x'|'linkedin'|'facebook')
  profiles     jsonb not null default '[]',
  connected_at timestamptz default now()
);

alter table buffer_integrations enable row level security;

create policy "Owner read/write" on buffer_integrations
  using (
    company_id in (select id from companies where owner_id = auth.uid())
  )
  with check (
    company_id in (select id from companies where owner_id = auth.uid())
  );
