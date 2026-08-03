-- Patch: member mobile, membership approval, and realtime for elder notifications.
--   1. users.mobile
--   2. users.membership_status (pending|approved|rejected). New sign-ups are
--      pending; existing rows are backfilled to approved so nobody is locked out.
--   3. Elders can update any user row (approve/reject) — protect_user_role still
--      guards role changes.
--   4. Add users/submissions/testimonies to the supabase_realtime publication so
--      the admin UI gets live event-driven updates (RLS still applies to realtime,
--      so only elders receive rows they're allowed to read).
-- Run in the Supabase SQL editor. Safe to re-run.

alter table users add column if not exists mobile text;
alter table users add column if not exists membership_status text not null default 'pending'
  check (membership_status in ('pending', 'approved', 'rejected'));

-- Existing members/elders predate approval — don't lock them out.
update users set membership_status = 'approved' where membership_status = 'pending';

drop policy if exists "users manageable by elders" on users;
create policy "users manageable by elders" on users
  for update using (is_elder()) with check (is_elder());

-- Realtime: add tables to the publication (ignore if already present).
do $$
begin
  begin
    alter publication supabase_realtime add table users;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table submissions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table testimonies;
  exception when duplicate_object then null;
  end;
end $$;
