-- Voice for generated plan posts: company (we/our) or personal (I/my)
alter table content_plans
  add column if not exists voice text not null default 'company'
  check (voice in ('personal', 'company'));
