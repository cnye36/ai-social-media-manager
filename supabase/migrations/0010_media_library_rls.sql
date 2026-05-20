-- Ensure the media bucket is public (update if it already exists as private)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- Idempotent storage policies for media bucket
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects' and schemaname = 'storage' and policyname = 'authenticated_upload'
  ) then
    execute $p$
      create policy "authenticated_upload" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'media')
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'objects' and schemaname = 'storage' and policyname = 'public_read'
  ) then
    execute $p$
      create policy "public_read" on storage.objects
        for select to public
        using (bucket_id = 'media')
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'objects' and schemaname = 'storage' and policyname = 'authenticated_delete'
  ) then
    execute $p$
      create policy "authenticated_delete" on storage.objects
        for delete to authenticated
        using (bucket_id = 'media')
    $p$;
  end if;
end $$;

-- Enable RLS and add access policies for media_library
alter table media_library enable row level security;

create policy "media_library_select" on media_library
  for select using (company_id in (select owned_company_ids()));

create policy "media_library_insert" on media_library
  for insert with check (company_id in (select owned_company_ids()));

create policy "media_library_delete" on media_library
  for delete using (company_id in (select owned_company_ids()));
