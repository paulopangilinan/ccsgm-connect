-- Patch: storage bucket for testimony images.
-- Public read (needed to display them); a user can only write files under their
-- own user-id folder: testimony-media/<auth.uid()>/...
-- Run in the Supabase SQL editor. Safe to re-run.

insert into storage.buckets (id, name, public)
values ('testimony-media', 'testimony-media', true)
on conflict (id) do nothing;

drop policy if exists "Testimony media is publicly readable" on storage.objects;
create policy "Testimony media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'testimony-media');

drop policy if exists "Users can upload their own testimony media" on storage.objects;
create policy "Users can upload their own testimony media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'testimony-media' and (storage.foldername(name))[1] = auth.uid()::text);
