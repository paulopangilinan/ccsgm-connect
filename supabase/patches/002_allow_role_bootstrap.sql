-- Patch: fix a lockout in 001_protect_user_role.sql.
-- That trigger blocked ALL role changes when auth.uid() is null, which includes
-- direct SQL-editor sessions -- so there was no way to bootstrap the first elder.
-- auth.uid() is only set for requests going through the app's own API (PostgREST/
-- GoTrue attach the JWT claims); a raw DB session has none, so restricting the
-- check to "auth.uid() is not null" only blocks the app itself, not project-owner
-- SQL run directly in the Supabase dashboard.
-- Run in the Supabase SQL editor. Safe to re-run.

create or replace function protect_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not is_elder() then
    raise exception 'Only elders can change user roles';
  end if;
  return new;
end;
$$;
