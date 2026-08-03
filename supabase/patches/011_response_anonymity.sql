-- Patch: let an elder reply anonymously, and show the elder's name otherwise
-- (schema.sql submission_responses).
--   is_anonymous    -- when true, the member sees "An elder".
--   responder_name  -- denormalized name captured at reply time (null when
--                      anonymous). Needed because RLS stops a member from
--                      reading an elder's users row via a join, so the name
--                      must live on the reply itself.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table submission_responses add column if not exists is_anonymous boolean not null default false;
alter table submission_responses add column if not exists responder_name text;
