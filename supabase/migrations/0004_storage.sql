-- Storage bucket for generated media (images, videos)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own company folder
create policy "authenticated_upload" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'media');

-- Public read for all media
create policy "public_read" on storage.objects
  for select
  to public
  using (bucket_id = 'media');

-- Allow users to delete their own uploads
create policy "authenticated_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'media');
