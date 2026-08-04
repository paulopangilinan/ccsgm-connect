-- Patch: birthday greetings (schema.sql).
-- "Greet via profile" writes a row here; it shows on the recipient's own
-- profile for a few days. Email/SMS greetings are sent directly, no row needed.
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists birthday_greetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  from_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table birthday_greetings enable row level security;

drop policy if exists "greetings readable by owner" on birthday_greetings;
create policy "greetings readable by owner" on birthday_greetings
  for select using (user_id = auth.uid());

drop policy if exists "greetings written by elders" on birthday_greetings;
create policy "greetings written by elders" on birthday_greetings
  for insert with check (is_elder());
