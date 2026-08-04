-- Patch: show the responder's avatar in reply threads (schema.sql submission_responses).
-- Denormalized like responder_name -- members can't read an elder's users row
-- via RLS, so the avatar is captured at reply time. Null when anonymous.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table submission_responses add column if not exists responder_avatar_url text;
