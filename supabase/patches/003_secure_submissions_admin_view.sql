-- Patch: close a data leak in submissions_admin (schema.sql).
-- Views run with the permissions of their OWNER by default -- in Supabase that's
-- the SQL-editor role, which bypasses RLS entirely. That meant ANY authenticated
-- user querying submissions_admin could read every row (prayer requests,
-- testimonies, counsel requests) regardless of the "submissions owned by user"
-- policy on the underlying table, since RLS was never actually being evaluated
-- for the view's underlying query.
-- security_invoker makes the view run as the querying user instead, so the
-- real RLS policies apply: elders see everything (is_elder()), everyone else
-- only sees their own submissions.
-- Run in the Supabase SQL editor. Safe to re-run.

alter view submissions_admin set (security_invoker = true);
