-- Founder accounts: a company can be a normal brand or an individual founder persona
alter table companies
  add column if not exists account_type text not null default 'company'
    check (account_type in ('company', 'founder'));

-- Founder-only voice context, kept alongside the rest of the brand profile
alter table brand_profiles
  add column if not exists bio text,
  add column if not exists projects jsonb not null default '[]'::jsonb;
