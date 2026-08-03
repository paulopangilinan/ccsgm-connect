-- Patch: dedicated testimonies model + answered prayers (schema.sql).
--   1. submissions.is_answered  — lets a member mark a prayer as answered.
--   2. testimonies + testimony_media  — testimonies move out of submissions;
--      they can link to an answered prayer, carry images, be shared to the
--      public website, and be anonymous (author shown as a generic string).
-- Run in the Supabase SQL editor. Safe to re-run.

alter table submissions add column if not exists is_answered boolean not null default false;

drop policy if exists "submissions updated by owner" on submissions;
create policy "submissions updated by owner" on submissions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists testimonies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  linked_prayer_id uuid references submissions(id) on delete set null,
  body text not null,
  is_anonymous boolean not null default false,
  share_to_website boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists testimony_media (
  id uuid primary key default gen_random_uuid(),
  testimony_id uuid not null references testimonies(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

alter table testimonies enable row level security;
alter table testimony_media enable row level security;

drop policy if exists "testimonies readable by owner and elders" on testimonies;
create policy "testimonies readable by owner and elders" on testimonies
  for select using (user_id = auth.uid() or is_elder());

drop policy if exists "testimonies written by owner" on testimonies;
create policy "testimonies written by owner" on testimonies
  for insert with check (user_id = auth.uid());

drop policy if exists "testimonies updated by owner" on testimonies;
create policy "testimonies updated by owner" on testimonies
  for update using (user_id = auth.uid());

drop policy if exists "testimonies deleted by owner" on testimonies;
create policy "testimonies deleted by owner" on testimonies
  for delete using (user_id = auth.uid());

drop policy if exists "testimony media readable by owner and elders" on testimony_media;
create policy "testimony media readable by owner and elders" on testimony_media
  for select using (
    is_elder()
    or exists (select 1 from testimonies t where t.id = testimony_id and t.user_id = auth.uid())
  );

drop policy if exists "testimony media written by owner" on testimony_media;
create policy "testimony media written by owner" on testimony_media
  for insert with check (
    exists (select 1 from testimonies t where t.id = testimony_id and t.user_id = auth.uid())
  );
