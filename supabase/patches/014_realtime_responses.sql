-- Patch: add submission_responses to the supabase_realtime publication so
-- reply threads (prayers/counseling for members, submissions for elders)
-- update live instead of requiring a manual reload. RLS still applies to
-- realtime, so a member only receives INSERTs for responses on their own
-- submissions, and elders receive all of them.
-- Run in the Supabase SQL editor. Safe to re-run.

do $$
begin
  begin
    alter publication supabase_realtime add table submission_responses;
  exception when duplicate_object then null;
  end;
end $$;
