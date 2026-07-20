-- Allow 'video' in the media library alongside existing image types
alter table media_library drop constraint if exists media_library_type_check;
alter table media_library add constraint media_library_type_check
  check (type in ('image', 'infographic', 'video'));

-- Video jobs for async Sora generation (mirrors scrape_jobs' async-job pattern)
create table video_jobs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references companies(id) on delete cascade not null,
  post_id         uuid references posts(id) on delete set null,
  prompt          text not null,
  model           text not null default 'sora-2',
  seconds         text not null default '4',
  size            text not null default '720x1280',
  status          text not null default 'queued' check (status in ('queued', 'in_progress', 'completed', 'failed')),
  openai_video_id text,
  progress        int default 0,
  storage_path    text,
  url             text,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz default now()
);

create index video_jobs_company_id on video_jobs (company_id);

alter table video_jobs enable row level security;

create policy "video_jobs_select" on video_jobs for select using (company_id in (select owned_company_ids()));
create policy "video_jobs_insert" on video_jobs for insert with check (company_id in (select owned_company_ids()));
create policy "video_jobs_update" on video_jobs for update using (company_id in (select owned_company_ids()));
