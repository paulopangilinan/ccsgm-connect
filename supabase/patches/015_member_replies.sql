-- Patch: let a member reply on their own prayer/counsel thread, not just
-- receive elder replies -- turns it into a real two-way conversation.
-- Run in the Supabase SQL editor. Safe to re-run.

drop policy if exists "responses written by submitter" on submission_responses;
create policy "responses written by submitter" on submission_responses
  for insert with check (
    responder_id = auth.uid()
    and exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );
