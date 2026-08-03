-- Patch: close the role self-escalation hole in the "users update own row" policy.
-- Run in the Supabase SQL editor against a database that already has schema.sql applied.
-- Safe to re-run.

create or replace function protect_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not is_elder() then
    raise exception 'Only elders can change user roles';
  end if;
  return new;
end;
$$;

drop trigger if exists users_protect_role on users;

create trigger users_protect_role
  before update on users
  for each row execute function protect_user_role();
