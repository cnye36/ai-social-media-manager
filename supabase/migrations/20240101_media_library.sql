-- Media library table for storing generated and uploaded images
create table if not exists media_library (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade not null,
  storage_path text not null,
  url          text not null,
  prompt       text,
  type         text not null default 'image' check (type in ('image', 'infographic')),
  svg          text,
  post_id      uuid references posts(id) on delete set null,
  created_at   timestamptz default now()
);

create index if not exists media_library_company_id on media_library (company_id);
create index if not exists media_library_created_at on media_library (company_id, created_at desc);
