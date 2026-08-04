-- Patch: photo attachments for submissions (prayer requests initially --
-- counsel_request rows just never get any, no separate constraint needed).
-- Mirrors testimony_media / the testimony-media bucket exactly.

create table submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

alter table submission_media enable row level security;

create policy "submission media readable by owner and elders" on submission_media
  for select using (
    is_elder()
    or exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

create policy "submission media written by owner" on submission_media
  for insert with check (
    exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

-- Public read (needed to display them); a user can only write files under
-- their own user-id folder: submission-media/<auth.uid()>/...
insert into storage.buckets (id, name, public)
values ('submission-media', 'submission-media', true)
on conflict (id) do nothing;

drop policy if exists "Submission media is publicly readable" on storage.objects;
create policy "Submission media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'submission-media');

drop policy if exists "Users can upload their own submission media" on storage.objects;
create policy "Users can upload their own submission media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'submission-media' and (storage.foldername(name))[1] = auth.uid()::text);
