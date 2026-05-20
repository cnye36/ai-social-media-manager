-- Extended brand profile fields for richer AI context
alter table brand_profiles
  add column if not exists company_description text,
  add column if not exists products_services    text,
  add column if not exists value_proposition    text,
  add column if not exists ideal_customer_profile text,
  add column if not exists pain_points          text[] default '{}',
  add column if not exists competitors          text[] default '{}',
  add column if not exists geographic_focus     text,
  add column if not exists company_stage        text,
  add column if not exists team_size            text;

-- Logo storage bucket (public reads, authenticated writes)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logo_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos');

create policy "logo_select" on storage.objects
  for select to public
  using (bucket_id = 'logos');

create policy "logo_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos');

create policy "logo_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos');
